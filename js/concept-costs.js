function conceptM2(c) {
  return Number(c?.m2) || 0;
}

function conceptLaborUnitCost(c) {
  return Number(c?.laborCost) || 0;
}

function conceptMaterialUnitCost(c) {
  return Number(c?.materialCost) || 0;
}

function conceptLaborCost(c) {
  return Math.round(conceptLaborUnitCost(c) * conceptM2(c));
}

function conceptMaterialCost(c) {
  return Math.round(conceptMaterialUnitCost(c) * conceptM2(c));
}

function conceptSaleTotal(c) {
  if (c?.totalPrice != null && c.totalPrice !== "") {
    return Math.round(Number(c.totalPrice) || 0);
  }
  const m2 = Number(c?.m2) || 0;
  const unit = Number(c?.unitPrice) || 0;
  return Math.round(m2 * unit);
}

function conceptProfit(c) {
  return conceptSaleTotal(c) - conceptLaborCost(c) - conceptMaterialCost(c);
}

function calcConceptEconomics(concepts, indirectTotal = 0) {
  const list = concepts || [];
  let laborTotal = 0;
  let materialTotal = 0;
  let saleTotal = 0;
  list.forEach((c) => {
    laborTotal += conceptLaborCost(c);
    materialTotal += conceptMaterialCost(c);
    saleTotal += conceptSaleTotal(c);
  });
  const indirect = Math.round(Number(indirectTotal) || 0);
  return {
    laborTotal,
    materialTotal,
    saleTotal,
    indirectTotal: indirect,
    profitTotal: saleTotal - laborTotal - materialTotal - indirect,
  };
}
