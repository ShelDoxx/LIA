import { assistanceReply, paymentReminder, type PolicyLite } from "@lia/nlu";

export type BotClient = {
  clientId?: string;
  firstName: string;
  lastName?: string;
  policies: PolicyLite[];
  producerName: string;
  activeRamos?: string[];
  documents?: Array<{ id?: string; type: string; name: string }>;
  verified?: boolean;
};

export function replyTo(text: string, client: BotClient): string {
  const firstName = client.firstName.trim();
  return assistanceReply({
    text,
    firstName,
    producerName: client.producerName,
    greeting: firstName ? `Hola ${firstName}.` : "Hola.",
    signOff: "",
    activeRamos: client.activeRamos ?? [],
    policies: client.policies,
    documents: client.documents,
    selfService: true,
  }).text;
}

export { generateRetentionMessage, paymentReminder } from "@lia/nlu";
