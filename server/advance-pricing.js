function advanceUsesSpecialPrice(advance) {
  return !!(
    advance &&
    advance.useSpecialPrice &&
    Number(advance.specialUnitPrice) > 0
  );
}

function advanceEffectiveUnitPrice(advance, concept) {
  if (advanceUsesSpecialPrice(advance)) {
    return Number(advance.specialUnitPrice);
  }
  return Number(concept?.unit_price ?? concept?.unitPrice) || 0;
}

function advanceAmount(advance, concept) {
  const m2 = Number(advance?.m2) || 0;
  return Math.round(m2 * advanceEffectiveUnitPrice(advance, concept));
}

module.exports = {
  advanceUsesSpecialPrice,
  advanceEffectiveUnitPrice,
  advanceAmount,
};
