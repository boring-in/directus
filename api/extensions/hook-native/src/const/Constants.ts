const receivedStatus = 1;
const processingStatus = 2;
const preparingStatus = 3;
const completedStatus = 4;
const cancelledStatus = 5;
const paymnetReceivedStatus = 48;
const orderProcessingStatus = 50;
const missingPorductsStatus = 37;
const productsOrderedStatus = 31;
const orderPreparingStatus = 50; // must be 50 
const psHost = "gerilesiai.lt";
const psPort = "3306";
const psUser = "csm2s4rex_lawree";
const psPassword = "4pGTqvC78JsgTSHG";
const psDatabase = "csm2s4rex_cosmo";
const log = true;
const logDataType = true;
const default_calculation_type = 3;
const default_calculations_timespan = 360;
const default_calculations_order_count = 1;
const default_calculations_buffer = 1.2;
const default_calculations_moq = 50;
const psWh1 = 5;
const psWh2 = 6;
const psWh3 = 7;

/**
 * Constants class providing static access to system-wide configuration values
 */
class Constants {
    static get receivedStatus(): number {
        return receivedStatus;
    }

    static get processingStatus(): number {
        return processingStatus;
    }

    static get preparingStatus(): number {
        return preparingStatus;
    }

    static get completedStatus(): number {
        return completedStatus;
    }

    static get cancelledStatus(): number {
        return cancelledStatus;
    }

    static get paymnetReceivedStatus(): number {
        return paymnetReceivedStatus;
    }

    static get orderProcessingStatus(): number {
        return orderProcessingStatus;
    }

    static get missingPorductsStatus(): number {
        return missingPorductsStatus;
    }

    static get productsOrderedStatus(): number {
        return productsOrderedStatus;
    }

    static get orderPreparingStatus(): number {
        return orderPreparingStatus;
    }

    static get psHost(): string {
        return psHost;
    }

    static get psPort(): string {
        return psPort;
    }

    static get psUser(): string {
        return psUser;
    }

    static get psPassword(): string {
        return psPassword;
    }

    static get psDatabase(): string {
        return psDatabase;
    }

    static get log(): boolean {
        return log;
    }

    static get logDataType(): boolean {
        return logDataType;
    }

    static get defaultCalculationType(): number {
        return default_calculation_type;
    }

    static get defaultCalculationTimespan(): number {
        return default_calculations_timespan;
    }

    static get defaultCalculationOrderCount(): number {
        return default_calculations_order_count;
    }

    static get defaultCalculationBuffer(): number {
        return default_calculations_buffer;
    }

    static get defaultCalculationMoq(): number {
        return default_calculations_moq;
    }

    /**
     * Gets the PS warehouse number based on the warehouse ID
     * @param warehouse - Warehouse ID (1-3)
     * @returns The corresponding PS warehouse number or undefined if not found
     */
    static getPsWarehouse(warehouse: number): number | undefined {
        switch (warehouse) {
            case 1:
                return psWh1;
            case 2:
                return psWh2;
            case 3:
                return psWh3;
            default:
                return undefined;
        }
    }
}

export default Constants;
