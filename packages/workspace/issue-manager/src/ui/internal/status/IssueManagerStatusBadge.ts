import type { IssueManagerStatus } from "../../../contracts/index.ts";
import {
  resolveIssueManagerStatusPresentation,
  type IssueManagerStatusBadgeVariant
} from "./IssueManagerStatusPresentation.ts";

export function issueManagerStatusBadgeVariant(
  status: IssueManagerStatus
): IssueManagerStatusBadgeVariant {
  return resolveIssueManagerStatusPresentation(status).badgeVariant;
}
