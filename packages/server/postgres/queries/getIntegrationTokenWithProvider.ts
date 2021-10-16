import getPg from '../getPg'
import {
  IntegrationProvidersEnum,
  getIntegrationTokensWithProviderQuery,
  IGetIntegrationTokensWithProviderQueryResult
} from './generated/getIntegrationTokensWithProviderQuery'
import {IntegrationTokenWithProvider} from 'parabol-server/types/IntegrationProviderAndTokenT'

export const nestProviderOnDbToken = (
  flatDbToken: IGetIntegrationTokensWithProviderQueryResult
) => {
  return Object.keys(flatDbToken).reduce(
    (obj, key) => {
      if (key.startsWith('IntegrationProvider_')) {
        return {
          ...obj,
          provider: {
            ...obj.provider,
            [key.replace('IntegrationProvider_', '')]: flatDbToken[key]
          }
        }
      }
      return {...obj, [key]: flatDbToken[key]}
    },
    {provider: {}}
  ) as IntegrationTokenWithProvider
}

const getIntegrationTokenWithProvider = async (
  providerType: IntegrationProvidersEnum,
  teamId: string,
  userId: string
) => {
  const [res] = await getIntegrationTokensWithProviderQuery.run(
    {providerType, teamId, userId, byUserId: true},
    getPg()
  )
  return nestProviderOnDbToken(res)
}

export default getIntegrationTokenWithProvider
