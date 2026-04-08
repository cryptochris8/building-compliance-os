import { describe, it, expect } from 'vitest';
import {
  parsePropertyList,
  parsePropertyDetails,
  parseMeterList,
  parseConsumptionData,
  parseAccountInfo,
  parseErrorResponse,
} from '../xml-parser';

describe('parsePropertyList', () => {
  it('parses property blocks XML', () => {
    const xml = `
      <response>
        <property>
          <propertyId>12345</propertyId>
          <name>Test Building</name>
          <address1>123 Main St</address1>
          <city>New York</city>
          <state>NY</state>
          <postalCode>10001</postalCode>
          <yearBuilt>1990</yearBuilt>
          <primaryFunction>Office</primaryFunction>
          <value>50000</value>
        </property>
        <property>
          <propertyId>67890</propertyId>
          <name>Other Building</name>
          <address1>456 Oak Ave</address1>
          <city>Boston</city>
          <state>MA</state>
          <postalCode>02101</postalCode>
          <yearBuilt>2005</yearBuilt>
          <primaryFunction>Retail</primaryFunction>
          <value>30000</value>
        </property>
      </response>`;

    const result = parsePropertyList(xml);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('12345');
    expect(result[0].name).toBe('Test Building');
    expect(result[0].address).toBe('123 Main St');
    expect(result[0].city).toBe('New York');
    expect(result[0].state).toBe('NY');
    expect(result[0].yearBuilt).toBe(1990);
    expect(result[0].grossFloorArea).toBe(50000);
    expect(result[1].id).toBe('67890');
  });

  it('parses link-style XML as fallback', () => {
    const xml = `
      <response>
        <link href="/property/111" hint="Building A">property/111</link>
        <link href="/property/222" hint="Building B">property/222</link>
      </response>`;

    const result = parsePropertyList(xml);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('111');
    expect(result[0].name).toBe('Building A');
    expect(result[1].id).toBe('222');
    expect(result[1].name).toBe('Building B');
  });

  it('returns empty array for empty XML', () => {
    expect(parsePropertyList('')).toEqual([]);
    expect(parsePropertyList('<response></response>')).toEqual([]);
  });
});

describe('parsePropertyDetails', () => {
  it('parses valid property details', () => {
    const xml = `
      <property>
        <propertyId>12345</propertyId>
        <name>Detail Building</name>
        <address1>789 Elm St</address1>
        <city>Chicago</city>
        <state>IL</state>
        <postalCode>60601</postalCode>
        <yearBuilt>2000</yearBuilt>
        <primaryFunction>Office</primaryFunction>
        <value>75000</value>
      </property>`;

    const result = parsePropertyDetails(xml);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('12345');
    expect(result!.name).toBe('Detail Building');
    expect(result!.city).toBe('Chicago');
  });

  it('returns null when no property ID found', () => {
    const xml = '<property><name>No ID</name></property>';
    expect(parsePropertyDetails(xml)).toBeNull();
  });
});

describe('parseMeterList', () => {
  it('parses meter blocks', () => {
    const xml = `
      <response>
        <meter>
          <meterId>M001</meterId>
          <type>Electric</type>
          <name>Main Electric</name>
          <unitOfMeasure>kWh</unitOfMeasure>
          <firstBillDate>2020-01-01</firstBillDate>
          <inUse>true</inUse>
        </meter>
        <meter>
          <meterId>M002</meterId>
          <type>Natural Gas</type>
          <name>Gas Meter</name>
          <unitOfMeasure>therms</unitOfMeasure>
          <firstBillDate>2020-06-01</firstBillDate>
          <inUse>false</inUse>
        </meter>
      </response>`;

    const result = parseMeterList(xml);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('M001');
    expect(result[0].type).toBe('Electric');
    expect(result[0].name).toBe('Main Electric');
    expect(result[0].unitOfMeasure).toBe('kWh');
    expect(result[0].inUse).toBe(true);
    expect(result[1].id).toBe('M002');
    expect(result[1].inUse).toBe(false);
  });

  it('parses link-style meters', () => {
    const xml = `
      <response>
        <link href="/meter/501" hint="Electric Meter">meter/501</link>
        <link href="/meter/502" hint="Gas Meter">meter/502</link>
      </response>`;

    const result = parseMeterList(xml);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('501');
    expect(result[0].name).toBe('Electric Meter');
    expect(result[1].id).toBe('502');
  });
});

describe('parseConsumptionData', () => {
  it('parses meterConsumption blocks', () => {
    const xml = `
      <response>
        <meterConsumption>
          <startDate>2024-01-01</startDate>
          <endDate>2024-01-31</endDate>
          <usage>45000</usage>
          <cost>6750</cost>
          <unitOfMeasure>kWh</unitOfMeasure>
        </meterConsumption>
        <meterConsumption>
          <startDate>2024-02-01</startDate>
          <endDate>2024-02-29</endDate>
          <usage>42000</usage>
          <cost>6300</cost>
          <unitOfMeasure>kWh</unitOfMeasure>
        </meterConsumption>
      </response>`;

    const result = parseConsumptionData(xml);
    expect(result).toHaveLength(2);
    expect(result[0].startDate).toBe('2024-01-01');
    expect(result[0].endDate).toBe('2024-01-31');
    expect(result[0].usage).toBe(45000);
    expect(result[0].cost).toBe(6750);
    expect(result[0].unit).toBe('kWh');
  });

  it('parses meterData blocks as fallback', () => {
    const xml = `
      <response>
        <meterData>
          <startDate>2024-03-01</startDate>
          <endDate>2024-03-31</endDate>
          <usage>1200</usage>
          <cost>1440</cost>
          <unitOfMeasure>therms</unitOfMeasure>
        </meterData>
      </response>`;

    const result = parseConsumptionData(xml);
    expect(result).toHaveLength(1);
    expect(result[0].usage).toBe(1200);
    expect(result[0].unit).toBe('therms');
  });
});

describe('parseAccountInfo', () => {
  it('parses valid account data', () => {
    const xml = `
      <account>
        <id>ACC123</id>
        <username>testuser@example.com</username>
      </account>`;

    const result = parseAccountInfo(xml);
    expect(result).not.toBeNull();
    expect(result!.accountId).toBe('ACC123');
    expect(result!.username).toBe('testuser@example.com');
  });

  it('returns null when no id or username', () => {
    const xml = '<account><other>data</other></account>';
    expect(parseAccountInfo(xml)).toBeNull();
  });
});

describe('parseErrorResponse', () => {
  it('extracts errorDescription', () => {
    const xml = '<error><errorDescription>Property not found</errorDescription></error>';
    expect(parseErrorResponse(xml)).toBe('Property not found');
  });

  it('falls back to error tag', () => {
    const xml = '<response><error>Bad request</error></response>';
    expect(parseErrorResponse(xml)).toBe('Bad request');
  });

  it('falls back to message tag', () => {
    const xml = '<response><message>Something went wrong</message></response>';
    expect(parseErrorResponse(xml)).toBe('Something went wrong');
  });

  it('returns default message for unknown format', () => {
    const xml = '<response><data>nothing useful</data></response>';
    expect(parseErrorResponse(xml)).toBe('Unknown error from Portfolio Manager API');
  });
});
