/**
 * Interface for hook service configuration
 */
interface ServiceConfig {
  services: {
    ItemsService: any;
  };
  getSchema: () => Promise<any>;
}

/**
 * Sets up warehouse-related hooks for the application
 * @param param0 - Service configuration object containing services and schema getter
 * @returns Object containing hook definitions
 */
export const setupWarehouseHooks = (_config: ServiceConfig) => {
  return {
    'warehouse.items.delete': {
      filter: async (keys: number[]): Promise<number[]> => {
        if (!Array.isArray(keys) || keys.length === 0) {
          return keys;
        }

        // Prevent deletion if warehouse ID is 1
        if (keys.includes(1)) {
          throw new Error('Cannot delete warehouse with ID 1');
        }

        return keys;
      }
    }
  };
};
