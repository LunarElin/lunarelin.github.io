export function cardArtClass(card) {
  return card.form?`art card-illustration illustration-form-${card.form}`:`art card-illustration illustration-${card.id}`;
}
