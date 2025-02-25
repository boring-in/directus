import Country from "./Country";

/**
 * Interface for the address data structure returned by the API
 */
interface AddressData {
  id: string | number;
  country: string | number;
  city: string;
  address: string;
  zip_postal_code: string;
}

/**
 * Generic interface for the ItemsService class
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
  new (collection: string, options: { schema: any }): GenericItemsService<T>;
}

/**
 * Class representing an Address entity
 * Handles address creation and retrieval operations
 */
class Address {
  private country: string;
  private city: string;
  private address: string;
  private postcode: string;
  private ItemsService: GenericItemsServiceConstructor<any>;
  private schema: any;
  private addressService: GenericItemsService<AddressData>;

  /**
   * Creates an instance of Address
   * @param country - Country code
   * @param city - City name
   * @param address - Street address
   * @param postcode - Postal/ZIP code
   * @param ItemsService - Service class for handling item operations
   * @param schema - Schema name for the database
   */
  constructor(
    country: string,
    city: string,
    address: string,
    postcode: string,
    ItemsService: GenericItemsServiceConstructor<any>,
    schema: any
  ) {
    this.country = country;
    this.city = city;
    this.address = address;
    this.postcode = postcode;
    this.ItemsService = ItemsService;
    this.schema = schema;
    this.addressService = new ItemsService("address", { schema: schema });
  }

  /**
   * Retrieves an address from the database or creates it if it doesn't exist
   * @returns Promise resolving to the address data
   */
  async getAddress(): Promise<AddressData> {
    const country = await Country.retrieveCountryByCode(
      this.country,
      this.ItemsService as any, // Type assertion needed due to generic constraints
      this.schema
    );

    const addressData = await this.addressService.readByQuery({
      filter: {
        _and: [
          { country: country.id },
          { city: this.city },
          { address: this.address },
          { zip_postal_code: this.postcode },
        ],
      },
    });

    console.log(addressData);
    if (!addressData || addressData.length === 0) {
      return this.createAddress();
    }
    
    const foundAddress = addressData[0];
    if (!foundAddress) {
      return this.createAddress();
    }

    return foundAddress;
  }

  /**
   * Creates a new address in the database
   * @returns Promise resolving to the created address data
   */
  private async createAddress(): Promise<AddressData> {
    const country = await Country.retrieveCountryByCode(
      this.country,
      this.ItemsService as any, // Type assertion needed due to generic constraints
      this.schema
    );

    const newAddressId = await this.addressService.createOne({
      country: country,
      city: this.city,
      address: this.address,
      zip_postal_code: this.postcode,
    });

    return {
      country: country.id,
      city: this.city,
      address: this.address,
      zip_postal_code: this.postcode,
      id: newAddressId,
    };
  }
}

export default Address;
