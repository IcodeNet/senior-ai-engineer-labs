# 12 · Query syntax: simple, full Lucene and OData filters

*Module 2 · Index design · step 3 of 3 · Track: TypeScript*

## Concept

A search request has two languages side by side:

```json
{
  "search": "chem*",
  "queryType": "simple",
  "filter": "status eq 'approved' and effectiveDate le 2026-11-28T00:00:00Z",
  "top": 5
}
```

- **`search`** is a query string for the full-text engine, parsed by the **simple** parser (default) or the **full Lucene** parser (`queryType: "full"`).
- **`filter`** is an **OData** boolean expression over filterable fields. It is exact, unscored and, for governance, not optional.

Why a senior engineer cares: most "search is broken" tickets are a query sent to the wrong parser, or a filter that does not match the schema. And the governance filter is a security boundary, so it must be built like one.

## Theory

**Simple syntax** supports terms, `"phrases"`, `+` (AND), `|` (OR), `-` (NOT), parentheses and **prefix** search: `chem*` matches "chemical" and "chemistry". It interprets imperfect input gracefully, and words such as AND are just terms. It does not support fuzzy search.

**Full Lucene syntax** adds fielded search (`title:refund`), fuzzy (`refnud~1`), proximity (`"card fee"~3`), term boosting (`refund^3`), regular expressions (`/.*numeric/`), infix and single-character wildcards (`non*al`, `c?rd`), and the text operators AND, OR and NOT, written in capitals. The character forms are `+` for AND and `!` or `-` for NOT; there is no character for OR in full syntax (`|` is not supported there, although it is OR in simple syntax). NOT also behaves differently: in full syntax a lone negation such as `-luxury` is not allowed, and negations are always ANDed onto the query. Range searches are done with `$filter`, not query syntax.

**The `chem*` example.** A wildcard query was once written as `{"search": "chem*", "queryType": "full"}`. That is valid, but full syntax is not required: **prefix** matching works in both parsers. You need full syntax for infix or single-character wildcards; suffix matching needs a regular expression. There is no hidden "partial match" switch: partial terms are expressed in query syntax.

**Partial terms are not analyzed and not scored.** Prefix, wildcard, regex and fuzzy terms are passed to the query tree as they are, skipping the analyzer, and are matched against the literal tokens in the index. Because most analyzers lower-case indexed text, `Contoso*` can miss `contoso`: Microsoft's guidance is to lower-case these terms in your application. Regular expressions are lower-case only. Stemming does not apply either, so `terminat*` can miss an index that stemmed the word to `termi`. Wildcard and regex matches are all scored equally (a uniform score of 1). A prefix of a few characters over a large index can be slow; Microsoft suggests edge n-gram tokenization for heavy type-ahead use.

**OData filters.** Comparison operators are `eq`, `ne`, `gt`, `lt`, `ge` and `le`; logical operators are `and`, `or` and `not`. Precedence is `not`, then comparisons, then `and`, then `or`, so `not status eq 'approved'` is an **error**: write `not (status eq 'approved')`. Literals are typed: strings in single quotes, with an embedded quote doubled (`'O''Brien'`); Booleans are `true`/`false`; dates are **unquoted** DateTimeOffset values such as `2026-11-28T00:00:00Z`; `null` tests absence. Collections need `any`/`all`, and functions such as `search.in` exist; this step's subset leaves them out.

**`approved eq true` vs `status eq 'approved'`.** These are two schema designs, not two spellings. Each is valid only against its own schema: on the Northbank index, `approved` does not exist, and `status eq true` is a type error. Generate the governance filter from the schema design in one place.

**Building filters safely.**

1. **Escape user values.** Microsoft calls out filter injection explicitly, especially for security trimming. `category eq '` + input + `'` with input `cards' or status eq 'draft` widens the query. Doubling quotes keeps the input inside one literal.
2. **Parenthesise caller filters.** `and` binds tighter than `or`, so `governance and a or b` means `(governance and a) or b`, and `b` bypasses governance. Always send `(governance) and (caller)`.
3. **The server owns the governance clause.** The client never sends it and can never remove it.

## Check questions

```question
prompt: Is queryType "full" required for the query "chem*"?
options:
  - Yes, wildcards always need the full Lucene parser
  - No, prefix search works in the simple parser too; full syntax is needed for infix, single-character wildcards, fuzzy, regex and fielded search
  - No, but you must enable a partialMatch option on the index
answer: No, prefix search works in the simple parser too; full syntax is needed for infix, single-character wildcards, fuzzy, regex and fielded search
explanation: >-
  {"search":"chem*","queryType":"full"} is valid, but the simple parser handles a trailing * as a prefix query.
  There is no partial-match switch to invent: partial terms are expressed with wildcards or regular expressions in
  the query syntax, and they are not analyzed or scored.
source: handoff
```

```question
prompt: Your index has a status string field. A teammate's code sends filter "approved eq true". What happens, and why?
answer: The request fails, because approved is not a field in this index. The filter belongs to a different schema design (a Boolean approved field).
explanation: >-
  approved eq true and status eq 'approved' are alternative designs, not interchangeable filters. Implement the
  expression that matches the actual field and type, and test it against the schema, as validateFilter does here.
source: handoff
```

```question
prompt: The server builds "status eq 'approved' and category eq 'cards' or category eq 'loans'". Which documents can come back?
answer: Approved cards answers, plus every loans answer, including drafts, because and binds tighter than or.
explanation: >-
  The expression parses as (status eq 'approved' and category eq 'cards') or category eq 'loans'. Wrapping each part
  in parentheses, (governance) and (caller), keeps governance on every branch.
```

```question
prompt: Why must a user-supplied value be escaped before it goes into a filter?
answer: Without escaping, a quote in the input can end the literal and inject extra filter logic, for example "or status eq 'draft'".
explanation: >-
  Microsoft warns about injection when building filters programmatically, especially for security trimming. Doubling
  embedded single quotes keeps the whole input inside one string literal.
```

```question
prompt: Why does "not status eq 'approved'" fail while "not (status eq 'approved')" works?
answer: In OData, not has higher precedence than comparison operators, so the first form applies not to the field alone.
explanation: >-
  Precedence is not, then eq/ne/gt/lt/ge/le, then and, then or. Use parentheses whenever not applies to a comparison,
  and generally whenever you combine expressions in code.
```

## Hands-on

`schema.ts` is your step 10 model and `odata.ts` tokenizes a subset of OData. Implement in `index.ts`:

- `escapeODataString(value)`: quote and double embedded quotes.
- `governanceFilter(design, asOf)`: for `"status"` or `"approved"`, the approval clause, then `effectiveDate le <asOf>T00:00:00Z and (expiryDate eq null or expiryDate ge <asOf>T00:00:00Z)`. Reject a malformed date.
- `withGovernance(callerFilter, design, asOf)`: governance alone, or `(governance) and (caller)`.
- `requiredQueryType(search)`: `"full"` for proximity, regex, the text operators AND/OR/NOT, a `!` negation, `field:term`, `~`, `^`, `?` and any `*` that is not at the end of a term; otherwise `"simple"`. Ignore escaped characters and text inside phrases.
- `lowercasePartialTerms(search)`: lower-case every prefix, wildcard and regex term (outside phrases and escapes), leaving ordinary terms and operators such as AND alone, because those terms bypass the analyzer.
- `validateFilter(filter, fields)`: parse with the precedence above and report `unknown-field`, `not-filterable` and `type-mismatch` problems; any parse error is a single `syntax` problem. This subset rejects every `not <field> <op> …`, including the valid OData `not IsEnabled eq true` on a Boolean field (which means `(not IsEnabled) eq true`); write it with parentheses instead.

## Recap and next

You can pick the parser a query needs, explain why `chem*` does not need full syntax, write typed OData filters, and build a governance filter that callers cannot widen or inject into. That completes Module 2. **Next:** Module 3 creates the real index on Azure (paid; lessons 17–21 are its current predecessor), loads Northbank content by push and by indexer, and queries it.

## Further reading

- [Lucene query syntax: Boolean operators, wildcard search and the effect of an analyzer](https://learn.microsoft.com/en-us/azure/search/query-lucene-syntax#boolean-operators)
- [Simple query syntax](https://learn.microsoft.com/en-us/azure/search/query-simple-syntax)
- [Lucene query syntax](https://learn.microsoft.com/en-us/azure/search/query-lucene-syntax)
- [Partial term search and patterns](https://learn.microsoft.com/en-us/azure/search/search-query-partial-matching)
- [OData language overview (constants and escaping)](https://learn.microsoft.com/en-us/azure/search/query-odata-filter-orderby-syntax)
- [OData $filter syntax (operator precedence)](https://learn.microsoft.com/en-us/azure/search/search-query-odata-filter)
- [OData comparison operators](https://learn.microsoft.com/en-us/azure/search/search-query-odata-comparison-operators)
- [Security filters for trimming results](https://learn.microsoft.com/en-us/azure/search/search-security-trimming-for-azure-search)
