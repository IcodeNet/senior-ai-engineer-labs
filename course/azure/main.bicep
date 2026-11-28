// Resources for the course's live Azure steps (Modules 3 and 4). Deployed into one course-only resource group,
// which `npm run azure:down` deletes as a whole. Keys are disabled everywhere: access is Microsoft Entra ID + RBAC only,
// for the learner and for the search service's own managed identity (indexers read Blob storage and call Azure OpenAI).
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

@description('Blob container that holds the Northbank source files read by the indexers.')
param storageContainer string = 'northbank-faq'

var suffix = uniqueString(resourceGroup().id)

resource search 'Microsoft.Search/searchServices@2023-11-01' = {
  name: 'srch-saiel-${suffix}'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' } // the indexers' identity for Blob storage and Azure OpenAI; Basic or higher
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

// Source files for the pull pipeline (data source → indexer → skillset → index). Shared keys and anonymous access are
// off: the learner uploads with an Entra ID token, and the search service reads with its managed identity.
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stsaiel${suffix}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' } // pay per GB stored and per operation; a few kilobytes here.
  properties: {
    accessTier: 'Hot'
    allowSharedKeyAccess: false
    allowBlobPublicAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: storageContainer
  properties: { publicAccess: 'None' }
}

var roles = {
  searchIndexDataContributor: '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
  searchServiceContributor: '7ca78c08-252a-4471-8644-bb5ff32d4ba0'
  cognitiveServicesOpenAIUser: '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
  storageBlobDataReader: '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'
  storageBlobDataContributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
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

// The learner uploads source files to the container.
resource learnerBlob 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, principalId, roles.storageBlobDataContributor)
  scope: storage
  properties: {
    principalId: principalId
    principalType: principalType
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.storageBlobDataContributor)
  }
}

// The search service's managed identity reads blobs (indexer data source)…
resource searchBlobReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, search.id, roles.storageBlobDataReader)
  scope: storage
  properties: {
    principalId: search.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.storageBlobDataReader)
  }
}

// …and calls the embedding deployment (embedding skill and query-time vectorizer).
resource searchOpenaiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(openai.id, search.id, roles.cognitiveServicesOpenAIUser)
  scope: openai
  properties: {
    principalId: search.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.cognitiveServicesOpenAIUser)
  }
}

output searchEndpoint string = 'https://${search.name}.search.windows.net'
output searchName string = search.name
output openaiEndpoint string = openai.properties.endpoint
output openaiName string = openai.name
output chatDeployment string = chat.name
output embeddingDeployment string = embedding.name
output storageAccountName string = storage.name
output storageAccountId string = storage.id
output blobEndpoint string = storage.properties.primaryEndpoints.blob
output storageContainer string = container.name
