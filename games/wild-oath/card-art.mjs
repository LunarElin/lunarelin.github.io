export function cardArtClass(card) {
  return card.form?`art art-${card.form}`:`art card-illustration illustration-${card.id}`;
}
