export type LegalOperatorType = 'COMPANY' | 'SOLE_PROPRIETOR' | 'SELF_EMPLOYED';

/** Проверяет реквизиты для включения платежей без вымышленных данных самозанятого. */
export function missingLegalFields(type: LegalOperatorType, values: Record<string, string | undefined>): string[] {
  const required = [
    'LEGAL_OPERATOR_NAME', 'LEGAL_TAX_ID', 'LEGAL_EMAIL', 'LEGAL_SUPPORT_EMAIL',
    ...type === 'SELF_EMPLOYED' ? [] : ['LEGAL_REGISTRATION_ID', 'LEGAL_ADDRESS'],
  ];
  return required.filter(key => !values[key]?.trim());
}
