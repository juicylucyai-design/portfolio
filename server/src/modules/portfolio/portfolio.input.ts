import type { CreateInvestmentRequest } from '@nksq/contracts';
import { asObject, optionalString, requireNumber, requireString } from '../../common/validation';

/** Validates a new investment from a request body. Error messages use the form's field labels. */
export function parseCreateInvestment(body: unknown): CreateInvestmentRequest {
  const input = asObject(body, 'Investment');
  return {
    companyName: requireString(input, 'companyName', 'Company name'),
    sector: optionalString(input, 'sector', 'Sector', 100),
    geography: optionalString(input, 'geography', 'Geography', 100),
    fiscalYearEndMonth: requireNumber(input, 'fiscalYearEndMonth', 'Fiscal year end month', { integer: true, min: 1, max: 12 }),
    instrument: requireString(input, 'instrument', 'Instrument', { max: 100 }),
    dealLead: optionalString(input, 'dealLead', 'Deal lead', 100),
  };
}
