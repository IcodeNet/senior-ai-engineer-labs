// Resources for the course's real-Azure section (Lab 03). Deployed into one course-only resource group,
// which `npm run azure:down` deletes as a whole. Keys are disabled: access is Microsoft Entra ID + RBAC only.
targetScope = 'resourceGroup'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Object ID of the learner who runs the labs; receives data-plane roles.')
param principalId string

@description('principalType of principalId: User or ServicePrincipal.')
@allowed(['User', 'ServicePrincipal'])
param principalType string = 'User'

@description('Tags applied to every resource; the course tag identifies what shutdown removes.')
param tags object

param chatModel object
param embeddingModel object

var suffix = uniqueString(resourceGroup().id)

resource search 'Microsoft.Search/searchServices@2023-11-01' = {
  name: 'srch-saiel-${suffix}'
  location: location
  tags: tags
  sku: { name: 'basic' } // Keyless (Entra ID/RBAC) data-plane access needs a billable tier, Basic or higher; billed per hour while it exists.
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    semanticSearch: 'free' // free plan: monthly allowance, then requests fail instead of billing.
    disableLocalAuth: true
    publicNetworkAccess: 'enabled'
  }
}

resource openai 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'oai-saiel-${suffix}'
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: { name: 'S0' } // pay per token; no hourly charge.
  properties: {
    customSubDomainName: 'oai-saiel-${suffix}'
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource embedding 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openai
  name: embeddingModel.deployment
  sku: { name: embeddingModel.sku, capacity: embeddingModel.capacity }
  properties: { model: { format: 'OpenAI', name: embeddingModel.name, version: embeddingModel.version } }
}

resource chat 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openai
  name: chatModel.deployment
  sku: { name: chatModel.sku, capacity: chatModel.capacity }
  properties: { model: { format: 'OpenAI', name: chatModel.name, version: chatModel.version } }
  dependsOn: [embedding] // deployments on one account must be created one at a time
}

var roles = {
  searchIndexDataContributor: '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
  searchServiceContributor: '7ca78c08-252a-4471-8644-bb5ff32d4ba0'
  cognitiveServicesOpenAIUser: '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
}

resource searchData 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, principalId, roles.searchIndexDataContributor)
  scope: search
  properties: {
    principalId: principalId
    principalType: principalType
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.searchIndexDataContributor)
  }
}

resource searchService 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(search.id, principalId, roles.searchServiceContributor)
  scope: search
  properties: {
    principalId: principalId
    principalType: principalType
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.searchServiceContributor)
  }
}

resource openaiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(openai.id, principalId, roles.cognitiveServicesOpenAIUser)
  scope: openai
  properties: {
    principalId: principalId
    principalType: principalType
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.cognitiveServicesOpenAIUser)
  }
}

output searchEndpoint string = 'https://${search.name}.search.windows.net'
output searchName string = search.name
output openaiEndpoint string = openai.properties.endpoint
output openaiName string = openai.name
output chatDeployment string = chat.name
output embeddingDeployment string = embedding.name
