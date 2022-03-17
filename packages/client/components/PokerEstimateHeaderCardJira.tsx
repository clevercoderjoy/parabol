import graphql from 'babel-plugin-relay/macro'
import React from 'react'
import {useFragment} from 'react-relay'
import {PokerEstimateHeaderCardJira_issue$key} from '../__generated__/PokerEstimateHeaderCardJira_issue.graphql'
import PokerEstimateHeaderCardHtml from './PokerEstimateHeaderCardHtml'

interface Props {
  issueRef: PokerEstimateHeaderCardJira_issue$key
}
const PokerEstimateHeaderCardJira = (props: Props) => {
  const {issueRef} = props
  const issue = useFragment(
    graphql`
      fragment PokerEstimateHeaderCardJira_issue on JiraIssue {
        issueKey
        summary
        descriptionHTML
        jiraUrl: url
      }
    `,
    issueRef
  )

  const {issueKey, summary, descriptionHTML, jiraUrl} = issue
  return (
    <PokerEstimateHeaderCardHtml
      summary={summary}
      descriptionHTML={descriptionHTML}
      url={jiraUrl}
      linkTitle={`Jira Issue #${issueKey}`}
      linkText={issueKey}
    />
  )
}

export default PokerEstimateHeaderCardJira
