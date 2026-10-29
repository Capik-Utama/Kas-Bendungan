type BalanceCard = {
  id: number;
  parent_id: number | null;
  kategori: string;
};

type BalanceTransaction = {
  kartu_id: number | null;
  nominal: number | string | null;
  jenis_keperluan?: string | null;
};

/**
 * Calculates each root group's net balance only from transactions explicitly
 * attached to a card in its tree. Unassigned transactions are never attributed.
 */
export function calculateGroupBalances(
  cards: BalanceCard[],
  incomeRows: BalanceTransaction[],
  expenseRows: BalanceTransaction[],
): Map<number, number> {
  const cardsById = new Map(cards.map((card) => [Number(card.id), card]));
  const rootGroups = cards.filter((card) => card.parent_id === null && card.kategori === "Kelompok");
  const balances = new Map(rootGroups.map((group) => [Number(group.id), 0]));

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

  const addRows = (rows: BalanceTransaction[], sign: 1 | -1) => {
    for (const row of rows) {
      if (sign === -1 && row.jenis_keperluan === "Ke petugas lain") continue;
      const groupId = row.kartu_id === null ? null : rootGroupForCard(Number(row.kartu_id));
      if (groupId === null) continue;
      balances.set(groupId, (balances.get(groupId) ?? 0) + sign * Number(row.nominal ?? 0));
    }
  };

  addRows(incomeRows, 1);
  addRows(expenseRows, -1);
  return balances;
}
