export type PolicyPublic = {
  id: string;
  clientId: string;
  clientName: string;
  type: string;
  number: string;
  company: string;
  nextDueDate: string;
  endDate: string;
  installment: number;
  phone: string;
};

const byId = new Map<string, PolicyPublic>();

export function indexPolicies(
  clients: Array<{
    phone: string;
    firstName: string;
    lastName?: string;
    clientId: string;
    policies: Array<{
      id: string;
      type: string;
      number: string;
      company: string;
      nextDueDate: string;
      endDate: string;
      installment: number;
    }>;
  }>,
) {
  byId.clear();
  for (const c of clients) {
    const clientName = c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName;
    for (const p of c.policies) {
      byId.set(p.id, {
        id: p.id,
        clientId: c.clientId,
        clientName,
        phone: c.phone,
        type: p.type,
        number: p.number,
        company: p.company,
        nextDueDate: p.nextDueDate,
        endDate: p.endDate,
        installment: p.installment,
      });
    }
  }
}

export function policyById(id: string) {
  return byId.get(id);
}
