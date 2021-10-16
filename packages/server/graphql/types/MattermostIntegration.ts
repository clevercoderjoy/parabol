import {GraphQLBoolean, GraphQLID, GraphQLNonNull, GraphQLObjectType} from 'graphql'
import GraphQLISO8601Type from './GraphQLISO8601Type'
import {GQLContext} from '../graphql'
import IntegrationProvider from './IntegrationProvider'

const MattermostIntegration = new GraphQLObjectType<any, GQLContext>({
  name: 'MattermostIntegration',
  description: 'OAuth token for a team member',
  fields: () => ({
    isActive: {
      description: 'true if the auth is updated & ready to use for all features, else false',
      type: new GraphQLNonNull(GraphQLBoolean),
      resolve: ({activeProvider}) => !!activeProvider
    },
    activeProvider: {
      description: 'The active Integration Provider details to be used to access Mattermost',
      type: IntegrationProvider
    },
    teamId: {
      type: new GraphQLNonNull(GraphQLID),
      description: 'The team that the token is linked to'
    },
    updatedAt: {
      type: new GraphQLNonNull(GraphQLISO8601Type),
      description: 'The timestamp the token was updated at'
    },
    userId: {
      type: new GraphQLNonNull(GraphQLID),
      description: 'The id of the user that integrated Mattermost'
    }
  })
})

export default MattermostIntegration
