import {GraphQLID, GraphQLInt, GraphQLNonNull} from 'graphql'
import {IUser, OrgUserRole, TierEnum} from 'parabol-client/types/graphql'
import {DataLoaderWorker, GQLContext} from '../../graphql'
import getRethink from '../../../database/rethinkDriver'
import {requireSU} from '../../../utils/authorization'
import DraftEnterpriseInvoicePayload from '../types/DraftEnterpriseInvoicePayload'
import StripeManager from '../../../utils/StripeManager'
import {fromEpochSeconds} from '../../../utils/epochTime'

const getBillingLeaderUser = async (email: string | null, orgId: string, dataLoader: DataLoaderWorker) => {
  const r = getRethink()
  if (email) {
    const user = await r.table('User').getAll(email, {index: 'email'})
      .nth(0)
      .default(null) as IUser | null
    if (!user) {
      throw new Error('User for email not found')
    }
    const {id: userId} = user
    const organizationUsers = await dataLoader.get('organizationUsersByUserId').load(userId)
    const organizationUser = organizationUsers.find((organizationUser) => organizationUser.orgId === orgId)
    if (!organizationUser) {
      throw new Error('Email not associated with a user on that org')
    }
    await r.table('OrganizationUser')
      .getAll(userId, {index: 'userId'})
      .filter({removedAt: null, orgId})
      .update({role: OrgUserRole.BILLING_LEADER})
    return user
  }
  const organizationUsers = await dataLoader.get('organizationUsersByOrgId').load(orgId)
  const billingLeaders = organizationUsers.filter((organizationUser) => organizationUser.role === OrgUserRole.BILLING_LEADER)
  const billingLeaderUserIds = billingLeaders.map(({userId}) => userId)
  return r.table('User').getAll(r.args(billingLeaderUserIds))
    .nth(0)
    .default(null) as IUser
}

export default {
  type: DraftEnterpriseInvoicePayload,
  description: 'Create a stripe customer & subscription in stripe, send them an invoice for an enterprise license',
  args: {
    orgId: {
      type: new GraphQLNonNull(GraphQLID),
      description: 'the org requesting the upgrade'
    },
    quantity: {
      type: new GraphQLNonNull(GraphQLInt),
      description: 'The number of users the license grants the organization'
    },
    email: {
      type: GraphQLID,
      description: 'Email address of billing leader, if different from the org billing leader'
    }
  },
  async resolve(
    _source,
    {orgId, quantity, email},
    {authToken, dataLoader}: GQLContext
  ) {
    const r = getRethink()
    const now = new Date()
    // const operationId = dataLoader.share()

    // AUTH
    requireSU(authToken)

    // VALIDATION
    if (quantity < 1) {
      return {error: {message: 'quantity must be a positive integer'}}
    }

    const org = await dataLoader.get('organizations').load(orgId)
    if (!org) {
      return {error: {message: 'Invalid orgId'}}
    }

    const {stripeId, stripeSubscriptionId, tier} = org
    if (tier === TierEnum.enterprise) {
      return {error: {message: 'Org is already enterprise'}}
    }
    // TODO handle upgrade from PRO to ENTERPRISE
    if (tier !== TierEnum.personal) {
      return {error: {message: 'Upgrading from PRO not supported. requires PR'}}
    }
    if (stripeSubscriptionId) {
      return {error: {message: 'Tier not PRO but subscription ID found. Big Error.'}}
    }

    // RESOLUTION
    let user: IUser
    try {
      user = await getBillingLeaderUser(email, orgId, dataLoader)
    } catch(e) {
      return {error: {message: e.message}}
    }

    const manager = new StripeManager()
    let customerId
    if (!stripeId) {
      // create the customer
      const customer = await manager.createCustomer(orgId, user.email)
      await r.table('Organization').get(orgId)
        .update({stripeId: customer.id})
      customerId = customer.id
    } else {
      customerId = stripeId
    }

    const subscription = await manager.createEnterpriseSubscription(customerId, orgId, quantity)

    await r({
      updatedOrg: r
        .table('Organization')
        .get(orgId)
        .update({
          periodEnd: fromEpochSeconds(subscription.current_period_end),
          periodStart: fromEpochSeconds(subscription.current_period_start),
          stripeSubscriptionId: subscription.id,
          tier: TierEnum.enterprise,
          updatedAt: now
        }),
      teamIds: r
        .table('Team')
        .getAll(orgId, {index: 'orgId'})
        .update({
          tier: TierEnum.enterprise,
          updatedAt: now
        })
    })
    dataLoader.get('organizations').clear(orgId)
    return {orgId}
  }
}