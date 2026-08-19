import type { PolicyType } from "@/lib/types";
import { detectRamo as detectRamoShared } from "@lia/nlu";

export {
  ALL_RAMOS,
  ASSISTANCE_LINES,
  RAMO_PLAYBOOK,
  assistanceReply,
  craneNumber,
  generateDunningMessage,
  generatePaymentReminderMessage,
  generateRenewalMessage,
  generateRetentionMessage,
  generateStuckClaimMessage,
  lineFor,
  playbook,
  ramoMenu,
  type AssistanceLine,
  type LiaBotReply,
  type RamoPlaybook,
  type RenewalBucket,
} from "@lia/nlu";

export function detectRamo(text: string, active: PolicyType[]): PolicyType | undefined {
  return detectRamoShared(text, active);
}
