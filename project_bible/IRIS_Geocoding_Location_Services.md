# IRIS Geocoding & Location-Based Services
## Geographic Targeting, Map-Based Alerting & Address Intelligence

**Document Version:** 1.0
**Last Updated:** 2025-10-28
**Part of:** IRIS Multi-Channel Communications Platform
**Priority:** **HIGH** - Critical for emergency alerts, geographic campaigns, compliance

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Address Geocoding](#2-address-geocoding)
3. [Reverse Geocoding](#3-reverse-geocoding)
4. [Geographic Targeting](#4-geographic-targeting)
5. [Map-Based Emergency Alerts](#5-map-based-emergency-alerts)
6. [Geofencing & Proximity](#6-geofencing--proximity)
7. [Timezone & TCPA Compliance](#7-timezone--tcpa-compliance)
8. [Address Validation & Standardization](#8-address-validation--standardization)
9. [Distance Calculation](#9-distance-calculation)
10. [Location Intelligence](#10-location-intelligence)
11. [Implementation Guide](#11-implementation-guide)

---

## 1. Executive Summary

### 1.1 What This Document Covers

**IRIS Location Services** enables geographic intelligence and map-based targeting:

✅ **Address Geocoding** - Convert addresses to coordinates (lat/long)
✅ **Reverse Geocoding** - Convert coordinates to addresses
✅ **Geographic Targeting** - Target by radius, polygon, ZIP/county
✅ **Map-Based Alerts** - Emergency alerts via map selection
✅ **Geofencing** - Trigger messages based on location entry/exit
✅ **Timezone Detection** - TCPA-compliant messaging by timezone
✅ **Address Validation** - Verify & standardize addresses
✅ **Distance Calculation** - Find contacts within X miles

### 1.2 Use Cases

| Use Case | Technology | Example |
|----------|-----------|---------|
| **Emergency Alerts** | Polygon drawing + IPAWS | "Alert all within tornado path" |
| **Local Campaigns** | Radius targeting | "Text all contacts within 5 miles of store" |
| **Timezone Compliance** | Timezone lookup | "Only send SMS 9am-9pm local time" |
| **Address Validation** | USPS/SmartyStreets | "Verify shipping address before sending" |
| **Proximity Alerts** | Geofencing | "Alert when customer enters 1-mile radius" |
| **County/ZIP Targeting** | FIPS codes | "Send to all in Los Angeles County" |

### 1.3 Provider Comparison

**Geocoding Providers:**

| Provider | Accuracy | Coverage | Free Tier | Cost | Speed |
|----------|----------|----------|-----------|------|-------|
| **Google Maps** | ⭐⭐⭐⭐⭐ | Global | $200/mo | $5/1K | 200ms |
| **Mapbox** | ⭐⭐⭐⭐ | Global | 100K/mo | $0.60/1K | 150ms |
| **OpenStreetMap (Nominatim)** | ⭐⭐⭐ | Global | Free | Free | 1000ms |
| **HERE** | ⭐⭐⭐⭐ | Global | 250K/mo | $1-4/1K | 300ms |
| **SmartyStreets** | ⭐⭐⭐⭐⭐ | US only | 250/mo | $1.10/1K | 100ms |

**Address Validation Providers:**

| Provider | Validation | Correction | Cost | Best For |
|----------|-----------|------------|------|----------|
| **USPS API** | ✅ | ✅ | Free | US addresses |
| **SmartyStreets** | ✅ | ✅ | $1.10/1K | US bulk validation |
| **Loqate** | ✅ | ✅ | $1.50/1K | International |
| **Google Address Validation** | ✅ | ✅ | $5/1K | Global, detailed |

**Recommendation:**
- **Geocoding:** Google Maps (best accuracy) + Mapbox (backup, cheaper at scale)
- **Address Validation:** USPS API (free) + SmartyStreets (batch processing)
- **Emergency Alerts:** PostGIS (self-hosted spatial queries) + IPAWS polygons

---

## 2. Address Geocoding

### 2.1 Multi-Provider Geocoding Architecture

```typescript
// Unified geocoding interface
interface GeocodingProvider {
  name: string;
  geocode(address: string, options?: GeocodingOptions): Promise<GeocodingResult>;
  batchGeocode(addresses: string[]): Promise<GeocodingResult[]>;
  estimateCost(requests: number): number;
}

interface GeocodingOptions {
  country?: string;      // 'US', 'CA', etc.
  bounds?: BoundingBox;  // Bias results to area
  language?: string;     // 'en', 'es', etc.
}

interface GeocodingResult {
  address: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  accuracy: 'rooftop' | 'street' | 'city' | 'region';
  components: AddressComponents;
  place_id?: string;
  confidence: number; // 0-1
}

interface AddressComponents {
  street_number?: string;
  street_name?: string;
  city: string;
  county?: string;
  state: string;
  state_code: string;    // 'CA', 'NY', etc.
  postal_code?: string;
  country: string;
  country_code: string;  // 'US', 'CA', etc.
}

// Geocoding router with fallback
class GeocodingRouter {
  private providers: Map<string, GeocodingProvider>;
  private fallbackOrder: string[];
  private cache: Redis;

  constructor() {
    this.providers = new Map([
      ['google', new GoogleMapsGeocoder()],
      ['mapbox', new MapboxGeocoder()],
      ['nominatim', new NominatimGeocoder()],
      ['smartystreets', new SmartyStreetsGeocoder()]
    ]);

    this.fallbackOrder = ['google', 'mapbox', 'nominatim'];
    this.cache = new Redis();
  }

  async geocode(
    address: string,
    options?: GeocodingOptions
  ): Promise<GeocodingResult> {
    // Check cache first
    const cacheKey = `geocode:${address}:${JSON.stringify(options)}`;
    const cached = await this.cache.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Try providers in order
    for (const providerName of this.fallbackOrder) {
      try {
        const provider = this.providers.get(providerName);
        if (!provider) continue;

        console.log(`📍 Geocoding with ${providerName}...`);

        const result = await provider.geocode(address, options);

        // Cache result for 30 days
        await this.cache.setex(cacheKey, 30 * 24 * 60 * 60, JSON.stringify(result));

        // Track usage
        await this.trackGeocoding({
          provider: providerName,
          address,
          success: true,
          accuracy: result.accuracy,
          confidence: result.confidence
        });

        return result;
      } catch (error) {
        console.error(`❌ ${providerName} geocoding failed:`, error.message);
        continue;
      }
    }

    throw new Error('All geocoding providers failed');
  }

  async batchGeocode(addresses: string[]): Promise<GeocodingResult[]> {
    // Use SmartyStreets for US batch geocoding (best pricing)
    const smarty = this.providers.get('smartystreets');

    if (smarty && this.areAllUSAddresses(addresses)) {
      return await smarty.batchGeocode(addresses);
    }

    // Otherwise geocode individually
    return await Promise.all(addresses.map(addr => this.geocode(addr)));
  }
}
```

### 2.2 Google Maps Geocoding Integration

```typescript
import { Client as GoogleMapsClient } from '@googlemaps/google-maps-services-js';

class GoogleMapsGeocoder implements GeocodingProvider {
  name = 'google';
  private client: GoogleMapsClient;

  constructor() {
    this.client = new GoogleMapsClient({});
  }

  async geocode(address: string, options?: GeocodingOptions): Promise<GeocodingResult> {
    const response = await this.client.geocode({
      params: {
        address,
        key: process.env.GOOGLE_MAPS_API_KEY,
        language: options?.language,
        bounds: options?.bounds,
        region: options?.country
      }
    });

    if (response.data.results.length === 0) {
      throw new Error('Address not found');
    }

    const result = response.data.results[0];

    return {
      address,
      formatted_address: result.formatted_address,
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      accuracy: this.getAccuracyLevel(result.geometry.location_type),
      components: this.parseComponents(result.address_components),
      place_id: result.place_id,
      confidence: 1.0
    };
  }

  async batchGeocode(addresses: string[]): Promise<GeocodingResult[]> {
    // Google doesn't have batch API, geocode individually
    return await Promise.all(addresses.map(addr => this.geocode(addr)));
  }

  getAccuracyLevel(locationType: string): 'rooftop' | 'street' | 'city' | 'region' {
    const map = {
      'ROOFTOP': 'rooftop',
      'RANGE_INTERPOLATED': 'street',
      'GEOMETRIC_CENTER': 'city',
      'APPROXIMATE': 'region'
    };
    return map[locationType] || 'city';
  }

  parseComponents(components: any[]): AddressComponents {
    const get = (type: string) => components.find(c => c.types.includes(type))?.long_name;
    const getShort = (type: string) => components.find(c => c.types.includes(type))?.short_name;

    return {
      street_number: get('street_number'),
      street_name: get('route'),
      city: get('locality') || get('sublocality') || get('administrative_area_level_3'),
      county: get('administrative_area_level_2'),
      state: get('administrative_area_level_1'),
      state_code: getShort('administrative_area_level_1'),
      postal_code: get('postal_code'),
      country: get('country'),
      country_code: getShort('country')
    };
  }

  estimateCost(requests: number): number {
    // $5 per 1000 requests (with $200/month free credit)
    return Math.max(0, (requests - 40000)) * 0.005;
  }
}
```

### 2.3 Mapbox Geocoding Integration

```typescript
import MapboxClient from '@mapbox/mapbox-sdk/services/geocoding';

class MapboxGeocoder implements GeocodingProvider {
  name = 'mapbox';
  private client: any;

  constructor() {
    this.client = MapboxClient({
      accessToken: process.env.MAPBOX_ACCESS_TOKEN
    });
  }

  async geocode(address: string, options?: GeocodingOptions): Promise<GeocodingResult> {
    const response = await this.client.forwardGeocode({
      query: address,
      limit: 1,
      countries: options?.country ? [options.country.toLowerCase()] : undefined,
      language: options?.language ? [options.language] : undefined
    }).send();

    if (response.body.features.length === 0) {
      throw new Error('Address not found');
    }

    const feature = response.body.features[0];

    return {
      address,
      formatted_address: feature.place_name,
      latitude: feature.geometry.coordinates[1],
      longitude: feature.geometry.coordinates[0],
      accuracy: this.getAccuracyLevel(feature.place_type[0]),
      components: this.parseContext(feature.context),
      place_id: feature.id,
      confidence: feature.relevance
    };
  }

  async batchGeocode(addresses: string[]): Promise<GeocodingResult[]> {
    // Mapbox batch API (max 50 per request)
    const batches: string[][] = [];
    for (let i = 0; i < addresses.length; i += 50) {
      batches.push(addresses.slice(i, i + 50));
    }

    const results: GeocodingResult[] = [];

    for (const batch of batches) {
      const batchResults = await Promise.all(batch.map(addr => this.geocode(addr)));
      results.push(...batchResults);
    }

    return results;
  }

  getAccuracyLevel(placeType: string): 'rooftop' | 'street' | 'city' | 'region' {
    const map = {
      'address': 'rooftop',
      'poi': 'rooftop',
      'neighborhood': 'street',
      'place': 'city',
      'region': 'region'
    };
    return map[placeType] || 'city';
  }

  parseContext(context: any[]): AddressComponents {
    const get = (type: string) => context?.find(c => c.id.startsWith(type))?.text;
    const getShort = (type: string) => context?.find(c => c.id.startsWith(type))?.short_code;

    return {
      city: get('place'),
      county: get('district'),
      state: get('region'),
      state_code: getShort('region')?.split('-')[1],
      postal_code: get('postcode'),
      country: get('country'),
      country_code: getShort('country')
    };
  }

  estimateCost(requests: number): number {
    // $0.60 per 1000 requests (100K free per month)
    return Math.max(0, (requests - 100000)) * 0.0006;
  }
}
```

### 2.4 Geocoding Database Schema

```sql
-- Geocoded addresses cache
CREATE TABLE geocoded_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Input
  input_address TEXT NOT NULL,
  country_code VARCHAR(2),

  -- Output
  formatted_address TEXT NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,

  -- Components
  street_number VARCHAR(50),
  street_name VARCHAR(255),
  city VARCHAR(100),
  county VARCHAR(100),
  state VARCHAR(100),
  state_code VARCHAR(2),
  postal_code VARCHAR(20),
  country VARCHAR(100),

  -- Metadata
  accuracy VARCHAR(50), -- 'rooftop', 'street', 'city', 'region'
  confidence DECIMAL(3,2),
  provider VARCHAR(50),
  place_id VARCHAR(255),

  -- Timestamps
  geocoded_at TIMESTAMPTZ DEFAULT NOW(),
  cached_until TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',

  INDEX idx_geocoded_input (input_address),
  INDEX idx_geocoded_coords (latitude, longitude),
  INDEX idx_geocoded_postal (postal_code),
  INDEX idx_geocoded_city (city, state_code)
);

-- Create PostGIS extension for spatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geometry column for efficient spatial queries
ALTER TABLE geocoded_addresses
  ADD COLUMN geom GEOMETRY(Point, 4326);

-- Create spatial index
CREATE INDEX idx_geocoded_geom ON geocoded_addresses USING GIST(geom);

-- Update geometry from lat/lon
CREATE OR REPLACE FUNCTION update_geocoded_geom()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER geocoded_addresses_geom_trigger
  BEFORE INSERT OR UPDATE ON geocoded_addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_geocoded_geom();
```

---

## 3. Reverse Geocoding

### 3.1 Convert Coordinates to Address

```typescript
// Reverse geocoding interface
interface ReverseGeocodingResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
  components: AddressComponents;
  accuracy: string;
}

class ReverseGeocoder {
  async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<ReverseGeocodingResult> {
    const response = await googleMapsClient.reverseGeocode({
      params: {
        latlng: { lat: latitude, lng: longitude },
        key: process.env.GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.results.length === 0) {
      throw new Error('Location not found');
    }

    const result = response.data.results[0];

    return {
      latitude,
      longitude,
      formatted_address: result.formatted_address,
      components: this.parseComponents(result.address_components),
      accuracy: result.geometry.location_type
    };
  }

  async getTimezoneFromCoords(
    latitude: number,
    longitude: number
  ): Promise<string> {
    const response = await googleMapsClient.timezone({
      params: {
        location: { lat: latitude, lng: longitude },
        timestamp: Math.floor(Date.now() / 1000),
        key: process.env.GOOGLE_MAPS_API_KEY
      }
    });

    return response.data.timeZoneId; // 'America/New_York'
  }
}
```

---

## 4. Geographic Targeting

### 4.1 Radius-Based Targeting

```typescript
// Find all contacts within X miles of a point
class GeographicTargeting {
  async findContactsInRadius(
    tenantId: string,
    centerLat: number,
    centerLon: number,
    radiusMiles: number
  ): Promise<Contact[]> {
    // Convert miles to meters (PostGIS uses meters)
    const radiusMeters = radiusMiles * 1609.34;

    const contacts = await db.query(`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.phone,
        c.email,
        c.address,
        c.latitude,
        c.longitude,
        ST_Distance(
          c.geom,
          ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
        ) / 1609.34 as distance_miles
      FROM contacts c
      WHERE c.tenant_id = $1
        AND c.geom IS NOT NULL
        AND ST_DWithin(
          c.geom,
          ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
          $4
        )
      ORDER BY distance_miles ASC
    `, [tenantId, centerLon, centerLat, radiusMeters]);

    return contacts.rows;
  }

  async findContactsInBoundingBox(
    tenantId: string,
    northLat: number,
    southLat: number,
    eastLon: number,
    westLon: number
  ): Promise<Contact[]> {
    const contacts = await db.query(`
      SELECT *
      FROM contacts
      WHERE tenant_id = $1
        AND latitude BETWEEN $2 AND $3
        AND longitude BETWEEN $4 AND $5
    `, [tenantId, southLat, northLat, westLon, eastLon]);

    return contacts.rows;
  }

  async findContactsInPolygon(
    tenantId: string,
    polygon: [number, number][] // Array of [lat, lon] pairs
  ): Promise<Contact[]> {
    // Convert polygon to PostGIS format
    const polygonWKT = this.polygonToWKT(polygon);

    const contacts = await db.query(`
      SELECT *
      FROM contacts c
      WHERE c.tenant_id = $1
        AND c.geom IS NOT NULL
        AND ST_Within(
          c.geom,
          ST_GeomFromText($2, 4326)
        )
    `, [tenantId, polygonWKT]);

    return contacts.rows;
  }

  polygonToWKT(polygon: [number, number][]): string {
    // Convert [[lat, lon], ...] to WKT format
    const coords = polygon.map(([lat, lon]) => `${lon} ${lat}`).join(', ');
    return `POLYGON((${coords}))`;
  }
}
```

### 4.2 ZIP Code & County Targeting

```typescript
// Target by ZIP code or county FIPS code
class AdministrativeTargeting {
  async findContactsByZipCodes(
    tenantId: string,
    zipCodes: string[]
  ): Promise<Contact[]> {
    const contacts = await db.query(`
      SELECT *
      FROM contacts
      WHERE tenant_id = $1
        AND postal_code = ANY($2)
    `, [tenantId, zipCodes]);

    return contacts.rows;
  }

  async findContactsByCounty(
    tenantId: string,
    countyFIPS: string[]
  ): Promise<Contact[]> {
    const contacts = await db.query(`
      SELECT c.*
      FROM contacts c
      JOIN counties co ON c.county = co.name AND c.state_code = co.state_code
      WHERE c.tenant_id = $1
        AND co.fips_code = ANY($2)
    `, [tenantId, countyFIPS]);

    return contacts.rows;
  }

  async getCountiesInState(stateCode: string): Promise<County[]> {
    const counties = await db.query(`
      SELECT *
      FROM counties
      WHERE state_code = $1
      ORDER BY name ASC
    `, [stateCode]);

    return counties.rows;
  }
}

// Counties reference table
CREATE TABLE counties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fips_code VARCHAR(5) UNIQUE NOT NULL, -- '06037' for LA County
  name VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  state_code VARCHAR(2) NOT NULL,
  population INTEGER,
  geom GEOMETRY(MultiPolygon, 4326),

  INDEX idx_counties_state (state_code),
  INDEX idx_counties_fips (fips_code),
  INDEX idx_counties_geom USING GIST(geom)
);
```

---

## 5. Map-Based Emergency Alerts

### 5.1 Draw Polygon on Map for Alert Targeting

```typescript
// Frontend: Map interface for drawing alert zones
class EmergencyAlertMap {
  private map: google.maps.Map;
  private drawingManager: google.maps.drawing.DrawingManager;
  private currentPolygon: google.maps.Polygon | null = null;

  initializeMap(containerId: string) {
    this.map = new google.maps.Map(document.getElementById(containerId), {
      center: { lat: 34.0522, lng: -118.2437 }, // LA
      zoom: 10,
      mapTypeId: 'roadmap'
    });

    this.drawingManager = new google.maps.drawing.DrawingManager({
      drawingMode: google.maps.drawing.OverlayType.POLYGON,
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [
          google.maps.drawing.OverlayType.POLYGON,
          google.maps.drawing.OverlayType.CIRCLE
        ]
      },
      polygonOptions: {
        fillColor: '#FF0000',
        fillOpacity: 0.3,
        strokeWeight: 2,
        strokeColor: '#FF0000',
        clickable: true,
        editable: true
      }
    });

    this.drawingManager.setMap(this.map);

    // Listen for polygon complete
    google.maps.event.addListener(
      this.drawingManager,
      'polygoncomplete',
      (polygon: google.maps.Polygon) => {
        this.currentPolygon = polygon;
        this.onPolygonDrawn(this.getPolygonCoordinates(polygon));
      }
    );
  }

  getPolygonCoordinates(polygon: google.maps.Polygon): [number, number][] {
    const path = polygon.getPath();
    const coords: [number, number][] = [];

    for (let i = 0; i < path.getLength(); i++) {
      const point = path.getAt(i);
      coords.push([point.lat(), point.lng()]);
    }

    // Close the polygon
    if (coords.length > 0) {
      coords.push(coords[0]);
    }

    return coords;
  }

  async getContactsInPolygon(polygon: [number, number][]): Promise<Contact[]> {
    const response = await fetch('/api/contacts/in-polygon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ polygon })
    });

    return await response.json();
  }

  onPolygonDrawn(polygon: [number, number][]) {
    // Show count of contacts in polygon
    this.getContactsInPolygon(polygon).then(contacts => {
      alert(`${contacts.length} contacts found in selected area`);
    });
  }
}
```

### 5.2 IPAWS Polygon Integration

```typescript
// Convert drawn polygon to IPAWS CAP format
class IPAWSPolygonConverter {
  convertToCAP(polygon: [number, number][]): string {
    // CAP format: "lat1,lon1 lat2,lon2 lat3,lon3"
    return polygon
      .map(([lat, lon]) => `${lat},${lon}`)
      .join(' ');
  }

  async sendIPAWSAlert(
    polygon: [number, number][],
    alert: EmergencyAlert
  ): Promise<void> {
    const capMessage = {
      identifier: generateUUID(),
      sender: alert.sender_email,
      status: 'Actual',
      msgType: 'Alert',
      scope: 'Public',
      info: {
        category: alert.category,
        event: alert.event_type,
        urgency: alert.urgency,
        severity: alert.severity,
        certainty: alert.certainty,
        area: {
          areaDesc: alert.area_description,
          polygon: this.convertToCAP(polygon)
        },
        parameter: [{
          valueName: 'WEA',
          value: '1' // Enable Wireless Emergency Alerts
        }]
      }
    };

    // Send to IPAWS
    await ipawsClient.sendAlert(capMessage);
  }
}
```

---

## 6. Geofencing & Proximity

### 6.1 Geofence Triggers

```typescript
// Create geofence that triggers message when entered/exited
class GeofencingService {
  async createGeofence(
    tenantId: string,
    name: string,
    centerLat: number,
    centerLon: number,
    radiusMeters: number,
    trigger: 'enter' | 'exit' | 'both',
    action: {
      type: 'send_message';
      template_id: string;
    }
  ): Promise<Geofence> {
    const geofence = await db.query(`
      INSERT INTO geofences (
        tenant_id,
        name,
        center_latitude,
        center_longitude,
        radius_meters,
        trigger_type,
        action,
        geom
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, ST_Buffer(
        ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
        $5
      )::geometry)
      RETURNING *
    `, [
      tenantId,
      name,
      centerLat,
      centerLon,
      radiusMeters,
      trigger,
      JSON.stringify(action)
    ]);

    return geofence.rows[0];
  }

  async checkGeofenceEntry(
    contactId: string,
    latitude: number,
    longitude: number
  ): Promise<GeofenceTrigger[]> {
    const triggers = await db.query(`
      SELECT g.*
      FROM geofences g
      WHERE g.is_active = true
        AND (g.trigger_type = 'enter' OR g.trigger_type = 'both')
        AND ST_Within(
          ST_SetSRID(ST_MakePoint($2, $3), 4326),
          g.geom
        )
        AND NOT EXISTS (
          SELECT 1
          FROM geofence_events ge
          WHERE ge.geofence_id = g.id
            AND ge.contact_id = $1
            AND ge.event_type = 'enter'
            AND ge.created_at > NOW() - INTERVAL '1 hour'
        )
    `, [contactId, longitude, latitude]);

    return triggers.rows;
  }
}

// Geofences table
CREATE TABLE geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  name VARCHAR(255) NOT NULL,

  -- Center point
  center_latitude DECIMAL(10,8) NOT NULL,
  center_longitude DECIMAL(11,8) NOT NULL,
  radius_meters INTEGER NOT NULL,

  -- Geometry (computed from center + radius)
  geom GEOMETRY(Polygon, 4326),

  -- Trigger config
  trigger_type VARCHAR(20) NOT NULL, -- 'enter', 'exit', 'both'
  action JSONB NOT NULL,

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_geofences_tenant (tenant_id),
  INDEX idx_geofences_geom USING GIST(geom)
);

-- Geofence events log
CREATE TABLE geofence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geofence_id UUID NOT NULL REFERENCES geofences(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),

  event_type VARCHAR(20) NOT NULL, -- 'enter', 'exit'

  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_geofence_events_geofence (geofence_id, created_at DESC),
  INDEX idx_geofence_events_contact (contact_id, created_at DESC)
);
```

---

## 7. Timezone & TCPA Compliance

### 7.1 Automatic Timezone Detection

```typescript
// Get timezone from address or coordinates
class TimezoneService {
  async getTimezoneFromAddress(address: string): Promise<string> {
    // Geocode address first
    const geocoded = await geocoder.geocode(address);

    // Get timezone from coordinates
    return await this.getTimezoneFromCoords(
      geocoded.latitude,
      geocoded.longitude
    );
  }

  async getTimezoneFromCoords(
    latitude: number,
    longitude: number
  ): Promise<string> {
    // Use Google Maps Timezone API
    const response = await googleMapsClient.timezone({
      params: {
        location: { lat: latitude, lng: longitude },
        timestamp: Math.floor(Date.now() / 1000),
        key: process.env.GOOGLE_MAPS_API_KEY
      }
    });

    return response.data.timeZoneId; // 'America/New_York'
  }

  async getTimezoneFromPhone(phone: string): Promise<string> {
    // Extract area code
    const areaCode = phone.replace(/\D/g, '').substring(0, 3);

    // Lookup area code timezone
    const result = await db.query(`
      SELECT timezone
      FROM area_codes
      WHERE area_code = $1
    `, [areaCode]);

    if (result.rows.length === 0) {
      return 'America/New_York'; // Default
    }

    return result.rows[0].timezone;
  }
}

// Area codes timezone reference
CREATE TABLE area_codes (
  area_code VARCHAR(3) PRIMARY KEY,
  state_code VARCHAR(2),
  timezone VARCHAR(50) NOT NULL,
  dst_observed BOOLEAN DEFAULT true,

  INDEX idx_area_codes_state (state_code)
);
```

### 7.2 TCPA-Compliant Scheduling

```typescript
// Only send SMS/calls during allowed hours (9am-9pm local time)
class TCPAComplianceService {
  async canSendNow(contactId: string): Promise<boolean> {
    const contact = await this.getContact(contactId);

    if (!contact.timezone) {
      // Try to determine timezone
      contact.timezone = await this.getTimezone(contact);
    }

    // Get current time in contact's timezone
    const localTime = DateTime.now().setZone(contact.timezone);

    const hour = localTime.hour;

    // TCPA: 9am-9pm local time
    if (hour < 9 || hour >= 21) {
      return false;
    }

    // Also check day of week (optional: no weekends)
    const dayOfWeek = localTime.weekday;
    if (dayOfWeek === 6 || dayOfWeek === 7) { // Saturday or Sunday
      return false;
    }

    return true;
  }

  async scheduleForNextAllowedTime(
    contactId: string,
    message: Message
  ): Promise<Date> {
    const contact = await this.getContact(contactId);
    let scheduledTime = DateTime.now().setZone(contact.timezone);

    // If outside allowed hours, schedule for next 9am
    if (scheduledTime.hour >= 21 || scheduledTime.hour < 9) {
      scheduledTime = scheduledTime.plus({ days: 1 }).set({ hour: 9, minute: 0 });
    }

    // Skip weekends
    while (scheduledTime.weekday === 6 || scheduledTime.weekday === 7) {
      scheduledTime = scheduledTime.plus({ days: 1 });
    }

    return scheduledTime.toJSDate();
  }
}
```

---

## 8. Address Validation & Standardization

### 8.1 USPS Address Validation

```typescript
// Validate and standardize US addresses
class AddressValidationService {
  async validateAddress(address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  }): Promise<ValidatedAddress> {
    // Use USPS API (free)
    const response = await fetch('https://secure.shippingapis.com/ShippingAPI.dll', {
      method: 'POST',
      body: this.buildUSPSRequest(address)
    });

    const xml = await response.text();
    const parsed = this.parseUSPSResponse(xml);

    return {
      is_valid: parsed.error === null,
      original: address,
      standardized: parsed.standardized,
      corrections: parsed.corrections,
      dpv_confirmed: parsed.dpv_confirmed, // Delivery Point Validation
      footnotes: parsed.footnotes
    };
  }

  async validateAndCorrectAddress(address: string): Promise<{
    is_valid: boolean;
    corrected_address: string;
    confidence: number;
  }> {
    // Use SmartyStreets for bulk validation
    const response = await fetch(
      'https://us-street.api.smartystreets.com/street-address',
      {
        params: {
          street: address,
          auth-id: process.env.SMARTYSTREETS_AUTH_ID,
          auth-token: process.env.SMARTYSTREETS_AUTH_TOKEN
        }
      }
    );

    const results = await response.json();

    if (results.length === 0) {
      return {
        is_valid: false,
        corrected_address: address,
        confidence: 0
      };
    }

    const result = results[0];

    return {
      is_valid: result.analysis.dpv_match_code === 'Y',
      corrected_address: result.delivery_line_1,
      confidence: result.analysis.dpv_match_code === 'Y' ? 1.0 : 0.5
    };
  }
}
```

---

## 9. Distance Calculation

### 9.1 Haversine Distance Formula

```typescript
// Calculate distance between two points (in miles)
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// Using PostGIS (more accurate, handles edge cases)
async function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): Promise<number> {
  const result = await db.query(`
    SELECT
      ST_Distance(
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
      ) / 1609.34 as distance_miles
  `, [lon1, lat1, lon2, lat2]);

  return result.rows[0].distance_miles;
}
```

---

## 10. Location Intelligence

### 10.1 Store Location Finder

```typescript
// Find nearest store/location to a contact
class LocationIntelligence {
  async findNearestStore(
    contactLat: number,
    contactLon: number
  ): Promise<Store> {
    const stores = await db.query(`
      SELECT
        s.*,
        ST_Distance(
          s.geom,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) / 1609.34 as distance_miles
      FROM stores s
      WHERE s.is_active = true
      ORDER BY distance_miles ASC
      LIMIT 1
    `, [contactLon, contactLat]);

    return stores.rows[0];
  }

  async sendLocalizedMessage(contactId: string) {
    const contact = await this.getContact(contactId);
    const nearestStore = await this.findNearestStore(
      contact.latitude,
      contact.longitude
    );

    // Send message with nearest store info
    await sendMessage({
      to: contact.phone,
      body: `Visit our store at ${nearestStore.address}, only ${nearestStore.distance_miles.toFixed(1)} miles away!`
    });
  }
}
```

---

## 11. Implementation Guide

### 11.1 Phase 0: Basic Geocoding (Week 1-2)

- [ ] Google Maps API integration
- [ ] Address geocoding endpoint
- [ ] Geocoding cache (Redis)
- [ ] PostGIS extension setup

### 11.2 Phase 1: Geographic Targeting (Week 3-4)

- [ ] Radius targeting
- [ ] Polygon targeting
- [ ] ZIP/county targeting
- [ ] Contact geocoding batch job

### 11.3 Phase 2: TCPA Compliance (Week 5)

- [ ] Timezone detection
- [ ] TCPA-compliant scheduling
- [ ] Area code timezone lookup

### 11.4 Phase 3: Advanced Features (Week 6+)

- [ ] Map-based alert UI
- [ ] IPAWS polygon integration
- [ ] Geofencing
- [ ] Address validation

---

**Document Complete**
**Status:** Comprehensive Location/Geocoding system
**File Size:** ~45KB
**Last Updated:** 2025-10-28
