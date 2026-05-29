function conceptLaborCost(c) {
  return Math.round(Number(c?.laborCost) || 0);
}

function conceptMaterialCost(c) {
  return Math.round(Number(c?.materialCost) || 0);
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

function calcConceptEconomics(concepts) {
  const list = concepts || [];
  let laborTotal = 0;
  let materialTotal = 0;
  let saleTotal = 0;
  list.forEach((c) => {
    laborTotal += conceptLaborCost(c);
    materialTotal += conceptMaterialCost(c);
    saleTotal += conceptSaleTotal(c);
  });
  return {
    laborTotal,
    materialTotal,
    saleTotal,
    profitTotal: saleTotal - laborTotal - materialTotal,
  };
}
