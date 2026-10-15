import { integrationContext } from '../integration-context';
export const currentCountry = () => integrationContext.getStore()?.countryCode;
