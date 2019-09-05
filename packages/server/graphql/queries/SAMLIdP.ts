import {GraphQLBoolean, GraphQLID, GraphQLNonNull, GraphQLString} from 'graphql'
import rateLimit from '../rateLimit'
import getSAMLURLFromEmail from '../../utils/getSAMLURLFromEmail'

export interface SSOParams {
  RelayState: string
}

export interface SSORelayState {
  isInvited?: boolean
}

const SAMLIdP = {
  args: {
    email: {
      type: new GraphQLNonNull(GraphQLID),
      description: 'the email associated with a SAML login'
    },
    isInvited: {
      type: GraphQLBoolean,
      description: 'true if the user was invited, else false'
    }
  },
  type: GraphQLString,
  resolve: rateLimit({perMinute: 6, perHour: 50})(async (_source, {email, isInvited}) => {
    return getSAMLURLFromEmail(email, isInvited)
  })
}

export default SAMLIdP
