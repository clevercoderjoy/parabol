import {GraphQLID, GraphQLNonNull} from 'graphql'
import getRethink from 'server/database/rethinkDriver'
import publish from 'server/utils/publish'
import {TEAM} from 'universal/utils/constants'
import {getUserId, isAuthenticated} from 'server/utils/authorization'
import standardError from 'server/utils/standardError'
import {GQLContext} from 'server/graphql/graphql'
import rateLimit from 'server/graphql/rateLimit'
import ms from 'ms'
import PushInvitationPayload from 'server/graphql/types/PushInvitationPayload'
import PushInvitation from 'server/database/types/PushInvitation'

const MAX_GLOBAL_DENIALS = 3
const GLOBAL_DENIAL_TIME = ms('30d')
const MAX_TEAM_DENIALS = 1

export default {
  type: PushInvitationPayload,
  description: 'Request to be invited to a team in real time',
  args: {
    teamId: {
      type: new GraphQLNonNull(GraphQLID)
    }
  },
  resolve: rateLimit({
    perMinute: 10,
    perHour: 20
  })(async (_source, {teamId}, {authToken, dataLoader, socketId: mutatorId}: GQLContext) => {
    const r = getRethink()
    const operationId = dataLoader.share()
    const subOptions = {mutatorId, operationId}
    const viewerId = getUserId(authToken)
    const thresh = new Date(Date.now() - GLOBAL_DENIAL_TIME)

    // AUTH
    if (!isAuthenticated(authToken)) return standardError(new Error('Not authenticated'))

    // VALIDATION
    const pushInvitations = (await r
      .table('PushInvitation')
      .getAll(viewerId, {index: 'userId'})) as PushInvitation[]
    const teamPushInvitation = pushInvitations.find((row) => row.teamId === teamId)
    if (teamPushInvitation) {
      const {denialCount, lastDenialAt} = teamPushInvitation
      if (denialCount > MAX_TEAM_DENIALS && lastDenialAt && lastDenialAt >= thresh) {
        return standardError(new Error('Previously denied. Must wait for an invitation'))
      }
    }

    const globalBlacklist = pushInvitations.filter(
      ({lastDenialAt}) => lastDenialAt && lastDenialAt >= thresh
    )
    if (globalBlacklist.length > MAX_GLOBAL_DENIALS) {
      return standardError(new Error('Denied from other teams. Must wait for an invitation'))
    }

    // RESOLUTION
    if (!teamPushInvitation) {
      // create a row so we know there was a request so denials are substantiated
      await r.table('PushInvitation').insert(new PushInvitation({userId: viewerId, teamId}))
    }

    const data = {userId: viewerId}
    publish(TEAM, teamId, PushInvitationPayload, data, subOptions)
    return null
  })
}
