import Address from "./Address";
import Country from "./Country";

/**
 * Interface for the schema configuration
 */
interface Schema {
  [key: string]: any;
}

/**
 * Interface for CountryData matching Country.ts structure
 */
interface CountryData {
  country_name: string;
  country_code: string;
  public_holidays: Array<{ holiday_date: string; [key: string]: any }>;
  id: string | number;
}

/**
 * Generic interface for ItemsService to handle different data types
 */
interface GenericItemsService<T> {
  readOne(id: string | number, options: { fields: string[] }): Promise<T>;
  readByQuery(query: { filter: any }): Promise<T[]>;
  createOne(data: any): Promise<string | number>;
}

/**
 * Generic interface for ItemsService constructor
 */
interface GenericItemsServiceConstructor<T> {
  new (collection: string, options: { schema: Schema }): GenericItemsService<T>;
}

/**
 * Interface representing the structure of customer data
 */
interface CustomerData {
  id: string | number;
  email: string;
  first_name: string;
  last_name: string;
  sales_channel?: string;
  address: string | number;
  parent_customer?: string | number | null;
}

/**
 * Customer class handles customer-related operations including creation and retrieval
 */
class Customer {
  private customerService: GenericItemsService<CustomerData>;
  private ItemsService: GenericItemsServiceConstructor<any>;
  private schema: Schema;
  private salesChannelId: string;
  private firstName: string;
  private lastName: string;
  private email: string;
  private country: string;
  private city: string;
  private address: string;
  private postcode: string;

  constructor(
    salesChannelId: string,
    firstName: string,
    lastName: string,
    email: string,
    country: string,
    city: string,
    address: string,
    postcode: string,
    ItemsService: GenericItemsServiceConstructor<any>,
    schema: Schema
  ) {
    this.salesChannelId = salesChannelId;
    this.firstName = firstName;
    this.lastName = lastName;
    this.email = email;
    this.country = country;
    this.city = city;
    this.address = address;
    this.postcode = postcode;

    this.customerService = new ItemsService("customers", { schema: schema });
    this.ItemsService = ItemsService;
    this.schema = schema;
  }

  /**
   * Retrieves or creates a customer based on email and sales channel
   * @returns Promise<CustomerData> The customer data
   */
  async getCustomer(): Promise<CustomerData> {
    let countryData = await Country.retrieveCountryByCode(
      this.country,
      this.ItemsService,
      this.schema
    );

    let adr = new Address(
      countryData.country_code,
      this.city,
      this.address,
      this.postcode,
      this.ItemsService,
      this.schema
    );
    let addressData = await adr.getAddress();

    let customerData = await this.customerService.readByQuery({
      filter: { email: this.email },
    });
    let customer: CustomerData;

    if (customerData.length === 0) {
      let parentCustomer = await this.customerService.createOne({
        email: this.email,
        first_name: this.firstName,
        last_name: this.lastName,
        address: addressData.id,
      });
      let customerId = await this.customerService.createOne({
        email: this.email,
        first_name: this.firstName,
        last_name: this.lastName,
        sales_channel: this.salesChannelId,
        address: addressData.id,
        parent_customer: parentCustomer,
      });
      customer = {
        id: customerId,
        email: this.email,
        first_name: this.firstName,
        last_name: this.lastName,
        sales_channel: this.salesChannelId,
        address: addressData.id,
        parent_customer: parentCustomer,
      };
    } else {
      let foundCustomer = customerData.find(
        (item) => item.sales_channel === this.salesChannelId
      );
      if (foundCustomer === undefined) {
        let parentCustomer = customerData.find(
          (item) => item.parent_customer === null
        );
        let customerId = await this.customerService.createOne({
          email: this.email,
          first_name: this.firstName,
          last_name: this.lastName,
          sales_channel: this.salesChannelId,
          address: addressData.id,
          parent_customer: parentCustomer!.id,
        });
        customer = {
          id: customerId,
          email: this.email,
          first_name: this.firstName,
          last_name: this.lastName,
          sales_channel: this.salesChannelId,
          address: addressData.id,
          parent_customer: parentCustomer!.id,
        };
      } else {
        customer = foundCustomer;
      }
    }
    return customer;
  }
}

export default Customer;
