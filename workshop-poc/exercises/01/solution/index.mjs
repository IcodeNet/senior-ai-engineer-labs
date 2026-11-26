export function approvedOnly(documents) {
  return documents.filter((document) => document.status === 'approved')
}
