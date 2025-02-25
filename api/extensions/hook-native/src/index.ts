import { Knex } from 'knex';
import { ServicesInterface, SchemaOverview } from '@directus/types';
import { setupOrderHooks } from './hooks/orderHooks';
import { setupStockHooks } from './hooks/stockHooks';
import { setupProductHooks } from './hooks/productHooks';
import { setupSupplierHooks } from './hooks/supplierHooks';
import { setupWarehouseHooks } from './hooks/warehouseHooks';
import DataWriter from "./model/DataWriter";

// Core interfaces for hook system
interface HookContext {
  services: ServicesInterface;
  database: Knex;
  getSchema: () => Promise<SchemaOverview>;
}

interface HookFunction {
  (...args: any[]): Promise<any> | any;
}

interface HookConfig {
  filter?: HookFunction;
  action?: HookFunction;
}

interface HookRegistration {
  action: (hookName: string, callback: HookFunction) => void;
  filter: (hookName: string, callback: HookFunction) => void;
  schedule: (cron: string, callback: () => Promise<void>) => void;
}

// Interface for hook setup functions
interface SetupHookFunction {
  (context: Partial<HookContext>): Record<string, HookConfig>;
}

export default ({ action, filter, schedule }: HookRegistration, { services, getSchema, database }: HookContext): void => {
  // Initialize all hooks
  const orderHooks = setupOrderHooks({ services, database, getSchema });
  const stockHooks = setupStockHooks({ services, database, getSchema });
  const productHooks = setupProductHooks({ services,database, getSchema });
  const supplierHooks = setupSupplierHooks({ services, getSchema });
  const warehouseHooks = setupWarehouseHooks({ services, getSchema });

  // Register Order Hooks
  Object.entries(orderHooks).forEach(([hookName, hookConfig]) => {
    if (hookConfig.filter) {
      filter(hookName, hookConfig.filter);
    }
    if (hookConfig.action) {
      action(hookName, hookConfig.action);
    }
  });

  // Register Stock Hooks
  Object.entries(stockHooks).forEach(([hookName, hookConfig]) => {
    if (hookConfig.filter) {
      filter(hookName, hookConfig.filter);
    }
    if (hookConfig.action) {
      action(hookName, hookConfig.action);
    }
  });

  // Register Product Hooks
  Object.entries(productHooks).forEach(([hookName, hookConfig]) => {
    if (hookConfig.filter) {
      filter(hookName, hookConfig.filter);
    }
    if (hookConfig.action) {
      action(hookName, hookConfig.action);
    }
  });

  // Register Supplier Hooks
  Object.entries(supplierHooks).forEach(([hookName, hookConfig]) => {
    if (hookConfig.filter) {
      filter(hookName, hookConfig.filter);
    }
    if (hookConfig.action) {
      action(hookName, hookConfig.action);
    }
  });

  // Register Warehouse Hooks
  Object.entries(warehouseHooks).forEach(([hookName, hookConfig]) => {
    if (hookConfig.filter) {
      filter(hookName, hookConfig.filter);
    }
    if (hookConfig.action) {
      action(hookName, hookConfig.action);
    }
  });

  // Schedule task for stock history
  schedule('5 0 * * *', async () => {
    const schema = await getSchema();
    let dataProvider = new DataWriter(schema);
    await dataProvider.writeStockHistory();
  });
};
