import {GraphQLID, GraphQLNonNull, GraphQLString} from 'graphql'
import {SubscriptionChannel} from 'parabol-client/types/constEnums'
import {IJiraCreateIssueOnMutationArguments} from 'parabol-client/types/graphql'
import AtlassianServerManager from '../../utils/AtlassianServerManager'
import {getUserId, isTeamMember} from '../../utils/authorization'
import publish from '../../utils/publish'
import segmentIo from '../../utils/segmentIo'
import standardError from '../../utils/standardError'
import {GQLContext} from '../graphql'
import JiraCreateIssuePayload from '../types/JiraCreateIssuePayload'

export default {
  name: 'JiraCreateIssue',
  type: JiraCreateIssuePayload,
  args: {
    cloudId: {
      type: new GraphQLNonNull(GraphQLID),
      description: 'The atlassian cloudId for the site'
    },
    cloudName: {
      type: new GraphQLNonNull(GraphQLString),
      description: 'The name of the jira cloud where the issue lives'
    },
    meetingId: {
      type: GraphQLID,
      description:
        'The id of the meeting where the Jira issue is being created. Null if it is not being created in a meeting.'
    },
    projectKey: {
      type: new GraphQLNonNull(GraphQLID),
      description: 'The atlassian key of the project to put the issue in'
    },
    summary: {
      type: new GraphQLNonNull(GraphQLString),
      description: 'The text content of the Jira issue'
    },
    teamId: {
      type: new GraphQLNonNull(GraphQLID),
      description: 'The id of the team that is creating the issue'
    }
  },
  resolve: async (
    _source: object,
    {cloudId, meetingId, projectKey, teamId, summary}: IJiraCreateIssueOnMutationArguments,
    {authToken, dataLoader, socketId: mutatorId}: GQLContext
  ) => {
    const operationId = dataLoader.share()
    const subOptions = {mutatorId, operationId}
    const viewerId = getUserId(authToken)

    // AUTH
    if (!isTeamMember(authToken, teamId)) {
      return standardError(new Error('Team not found'), {userId: viewerId})
    }

    // VALIDATION
    const viewerAuthRes = await dataLoader.get('atlassianAuthByUserId').load(viewerId)
    const viewerAuth = viewerAuthRes.find((auth) => auth.teamId === teamId)

    if (!viewerAuth || !viewerAuth.isActive) {
      return standardError(new Error('The viewer does not have access to Jira'), {
        userId: viewerId
      })
    }

    // RESOLUTION
    const accessToken = await dataLoader
      .get('freshAtlassianAccessToken')
      .load({teamId, userId: viewerId})
    const manager = new AtlassianServerManager(accessToken)
    const [sites, issueMetaRes, description] = await Promise.all([
      manager.getAccessibleResources(),
      manager.getCreateMeta(cloudId, [projectKey]),
      manager.convertMarkdownToADF(summary)
    ] as const)
    if ('message' in sites) {
      return standardError(new Error(sites.message), {userId: viewerId})
    }
    if ('message' in issueMetaRes) {
      return standardError(new Error(issueMetaRes.message), {userId: viewerId})
    }
    if ('errors' in issueMetaRes) {
      return standardError(new Error(Object.values(issueMetaRes.errors)[0]), {userId: viewerId})
    }
    const {projects} = issueMetaRes
    // should always be the first and only item in the project arr
    const project = projects.find((project) => project.key === projectKey)!
    const {issuetypes} = project
    const bestType = issuetypes.find((type) => type.name === 'Task') || issuetypes[0]
    const payload = {
      summary,
      description,
      // ERROR: Field 'reporter' cannot be set. It is not on the appropriate screen, or unknown.
      assignee: {
        id: viewerAuth.accountId
      },
      issuetype: {
        id: bestType.id
      }
    }
    const res = await manager.createIssue(cloudId, projectKey, payload)
    if ('message' in res) {
      return standardError(new Error(res.message), {userId: viewerId})
    }
    if ('errors' in res) {
      return standardError(new Error(Object.values(res.errors)[0]), {userId: viewerId})
    }
    const cloud = sites.find((site) => site.id === cloudId)!
    const data = {
      cloudId,
      cloudName: cloud.name,
      key: res.key,
      meetingId,
      summary,
      teamId
    }
    if (meetingId) {
      publish(SubscriptionChannel.MEETING, meetingId, 'JiraCreateIssuePayload', data, subOptions)
    }
    segmentIo.track({
      userId: viewerId,
      event: 'Published Task to Jira',
      properties: {
        teamId,
        meetingId
      }
    })
    return data
  }
}
