type BalanceCard = {
  id: number;
  parent_id: number | null;
  kategori: string;
  nama: string;
};

type BalanceGroup = {
  id: number;
  nama: string;
};

type BalanceTransaction = {
  kartu_id: number | null;
  nominal: number | string | null;
  jenis_keperluan?: string | null;
  tujuan_kelompok_id?: number | null;
};

/**
 * Calculates group balances only from explicitly linked transactions. Staff
 * handovers stay within the group; inter-group transfers debit the source and
 * credit the destination. Unassigned transactions are never attributed.
 */
export function calculateGroupBalances(
  cards: BalanceCard[],
  incomeRows: BalanceTransaction[],
  expenseRows: BalanceTransaction[],
  groups: BalanceGroup[] = [],
): Map<number, number> {
  const cardsById = new Map(cards.map((card) => [Number(card.id), card]));
  const rootGroups = cards.filter((card) => card.parent_id === null && card.kategori === "Kelompok");
  const balances = new Map(rootGroups.map((group) => [Number(group.id), 0]));
  const rootCardByGroupId = new Map<number, number>();
  const rootCardByName = new Map(rootGroups.map((card) => [card.nama.trim().toLocaleLowerCase("id-ID"), Number(card.id)]));
  for (const group of groups) {
    const rootCardId = rootCardByName.get(group.nama.trim().toLocaleLowerCase("id-ID"));
    if (rootCardId !== undefined) rootCardByGroupId.set(Number(group.id), rootCardId);
  }

  const rootGroupForCard = (cardId: number): number | null => {
    let current = cardsById.get(cardId);
    const visited = new Set<number>();
    while (current && !visited.has(Number(current.id))) {
      const currentId = Number(current.id);
      visited.add(currentId);
      if (current.parent_id === null) {
        return current.kategori === "Kelompok" && balances.has(currentId) ? currentId : null;
      }
      current = cardsById.get(Number(current.parent_id));
    }
    return null;
  };

  const addRows = (rows: BalanceTransaction[]) => {
    for (const row of rows) {
      const groupId = row.kartu_id === null ? null : rootGroupForCard(Number(row.kartu_id));
      if (groupId === null) continue;
      balances.set(groupId, (balances.get(groupId) ?? 0) + Number(row.nominal ?? 0));
    }
  };

  addRows(incomeRows);
  for (const row of expenseRows) {
    if (row.jenis_keperluan !== "Kebutuhan kelompok" && row.jenis_keperluan !== "Ke kelompok lain") continue;
    const amount = Number(row.nominal ?? 0);
    if (row.kartu_id !== null) {
      const sourceGroupId = rootGroupForCard(Number(row.kartu_id));
      if (sourceGroupId !== null) balances.set(sourceGroupId, (balances.get(sourceGroupId) ?? 0) - amount);
    }
    if (row.jenis_keperluan === "Ke kelompok lain" && row.tujuan_kelompok_id !== null && row.tujuan_kelompok_id !== undefined) {
      const destinationGroupId = rootCardByGroupId.get(Number(row.tujuan_kelompok_id));
      if (destinationGroupId !== undefined) balances.set(destinationGroupId, (balances.get(destinationGroupId) ?? 0) + amount);
    }
  }
  return balances;
}
