type BalanceCard = {
  id: number;
  parent_id: number | null;
  kategori: string;
};

type BalanceTransaction = {
  kartu_id: number | null;
  nominal: number | string | null;
};

/**
 * Calculates each root group's net balance from transactions attached anywhere
 * in its card tree. Unassigned transactions are attributed only when there is
 * exactly one root group, where ownership is unambiguous.
 */
export function calculateGroupBalances(
  cards: BalanceCard[],
  incomeRows: BalanceTransaction[],
  expenseRows: BalanceTransaction[],
): Map<number, number> {
  const cardsById = new Map(cards.map((card) => [Number(card.id), card]));
  const rootGroups = cards.filter((card) => card.parent_id === null && card.kategori === "Kelompok");
  const balances = new Map(rootGroups.map((group) => [Number(group.id), 0]));
  const soleGroupId = rootGroups.length === 1 ? Number(rootGroups[0].id) : null;

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
      const groupId = row.kartu_id === null
        ? soleGroupId
        : rootGroupForCard(Number(row.kartu_id));
      if (groupId === null) continue;
      balances.set(groupId, (balances.get(groupId) ?? 0) + sign * Number(row.nominal ?? 0));
    }
  };

  addRows(incomeRows, 1);
  addRows(expenseRows, -1);
  return balances;
}
