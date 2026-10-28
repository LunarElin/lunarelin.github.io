const illustrations=Object.freeze({
  claw:'claw',bite:'bite',bark:'bark',mend:'mend',sap:'sap',
  venom:'venom',thorns:'ember',storm:'storm',pounce:'pounce',ancient:'ancient',
  moonwell:'moonwell',frost:'frost',wildheart:'bark',ember:'ember',nettle:'venom',
  static:'storm',harvest:'sap',sprout:'mend',hide:'bark',trample:'bite',
  talon:'venom',renewal:'mend',kindle:'sap',rally:'sap',harry:'claw',
});

export function cardArtClass(card) {
  return card.form?`art art-${card.form}`:`art card-illustration illustration-${illustrations[card.id]||'bark'}`;
}
