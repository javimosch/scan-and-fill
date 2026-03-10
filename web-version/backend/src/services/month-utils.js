const MONTH_RULES = [
  { index: 0, en: ['january', 'jan'], fr: ['janvier', 'janv'], es: ['enero', 'ene'] },
  { index: 1, en: ['february', 'feb'], fr: ['fevrier', 'février', 'fevr', 'févr'], es: ['febrero', 'feb'] },
  { index: 2, en: ['march', 'mar'], fr: ['mars'], es: ['marzo', 'mar'] },
  { index: 3, en: ['april', 'apr'], fr: ['avril', 'avr'], es: ['abril', 'abr'] },
  { index: 4, en: ['may'], fr: ['mai'], es: ['mayo', 'may'] },
  { index: 5, en: ['june', 'jun'], fr: ['juin'], es: ['junio', 'jun'] },
  { index: 6, en: ['july', 'jul'], fr: ['juillet', 'juil'], es: ['julio', 'jul'] },
  { index: 7, en: ['august', 'aug'], fr: ['aout', 'août'], es: ['agosto', 'ago'] },
  { index: 8, en: ['september', 'sep', 'sept'], fr: ['septembre', 'sept'], es: ['septiembre', 'sep'] },
  { index: 9, en: ['october', 'oct'], fr: ['octobre', 'oct'], es: ['octubre', 'oct'] },
  { index: 10, en: ['november', 'nov'], fr: ['novembre', 'nov'], es: ['noviembre', 'nov'] },
  { index: 11, en: ['december', 'dec'], fr: ['decembre', 'décembre', 'dec', 'déc'], es: ['diciembre', 'dic'] }
];

export function identifyMonth(input) {
  if (!input) return null;
  const normalized = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const rule of MONTH_RULES) {
    const variants = [...rule.en, ...rule.fr, ...rule.es];
    const regex = new RegExp(`(^|[^a-z])(${variants.join('|')})([^a-z]|$)`, 'i');
    if (regex.test(normalized)) {
      return { index: rule.index, standardName: capitalize(rule.en[0]) };
    }
  }
  return null;
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
