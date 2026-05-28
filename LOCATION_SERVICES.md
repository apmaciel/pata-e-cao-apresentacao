# Spatial Index on PostgreSQL
To implement spatial indexing in PostgreSQL, we need to use the [PostGIS](https://postgis.net/) extension. PostGIS adds spatial data types and builds high-performance R-tree spatial indexes using the Generalized Search Tree (GiST) method. [1, 2, 3, 4, 5] 
## How to Create a Spatial Index
Standard database indexes do not understand geometries. Instead, spatial indexes are built on bounding boxes. The database uses the index to quickly find features that fall within an approximate bounding box, and then uses precise spatial functions (like ST_Intersects or ST_DWithin) to filter exact results. [4, 5] 
Run the following SQL commands in your database:

   1. Enable the PostGIS extension (if not already enabled): [6] 
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

   2. Create a table with a spatial column [6] 

```sql
CREATE TABLE locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    geom GEOMETRY(Point, 4326) -- SRID 4326 is WGS84 for GPS coordinates
);
```

   3. Create the GiST Spatial Index [4, 6] 

```sql
CREATE INDEX idx_locations_geom ON locations USING GIST (geom);
```

   4. Update statistics after bulk loading [7]

```sql
ANALYZE locations;
```

## Writing Optimized Spatial Queries
To make PostgreSQL utilize your spatial index, ensure you use the bounding box operator && alongside your exact spatial function in the WHERE clause. [4] 
Example for finding points within a specific distance (e.g., radius search): [8] 

```sql
SELECT id, nameFROM locationsWHERE geom && ST_MakeEnvelope(-46.6, -23.5, -46.5, -23.4, 4326) 
-- Uses index
AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(-46.55, -23.45), 4326), 5000); 
-- Exact radius filter
```

## Best Practices for Spatial Indexes

* Always specify the SRID: When defining GEOMETRY or GEOGRAPHY types, explicitly define your Spatial Reference System Identifier (e.g., 4326 for GPS/WGS84) so indices calculate distances correctly.
* Use ST_DWithin for radius searches: It is highly optimized to use the GiST index and the earth's curvature for calculations.
* Optimize via VACUUM: Maintain table space reclamation by running VACUUM ANALYZE regularly, particularly after bulk inserts or deletes. [6, 8, 9, 10] 


[1] [https://www.crunchydata.com](https://www.crunchydata.com/blog/tricks-for-faster-spatial-indexes)
[2] https://postgis.net
[3] [https://developers.redhat.com](https://developers.redhat.com/articles/2025/10/02/postgis-powerful-geospatial-extension-postgresql)
[4] [https://postgis.net](https://postgis.net/docs/manual-1.3/ch03.html)
[5] [https://postgis.net](https://postgis.net/workshops/de/postgis-intro/indexing.html)
[6] [https://oneuptime.com](https://oneuptime.com/blog/post/2026-01-30-spatial-index-design/view)
[7] [https://postgis.net](https://postgis.net/workshops/uk/postgis-intro/indexing.html)
[8] [https://neon.com](https://neon.com/guides/geospatial-search)
[9] [https://postgis.net](https://postgis.net/workshops/ko/postgis-intro/indexing.html)
[10] [https://peerj.com](https://peerj.com/articles/cs-3220/)

---
# Using PostGIS for Brazilian Addresses
To use [PostGIS](https://postgis.net/) for Brazilian addresses, you need to structure your table to match standard Brazilian postal formats (CEP, Logradouro, Bairro, etc.), choose the correct spatial projection system (SRID), and build a spatial index. [1, 2] 
Standard database text indices are used for address strings, while GiST spatial indices handle the latitude and longitude coordinates.
## 1. Structure the Table for Brazilian Data
A production-ready schema for Brazilian addresses splits the textual components and stores the geolocation as a GEOMETRY point using SRID 4326 (WGS 84, standard for GPS coordinates).

```sql
CREATE TABLE enderecos_brasil (
    id SERIAL PRIMARY KEY,
    cep CHAR(8) NOT NULL,                    -- 8-digit zip code (e.g., '03155000')
    logradouro VARCHAR(150) NOT NULL,        -- Street name (e.g., 'Avenida Professor Luiz Ignácio Anhaia Mello')
    numero VARCHAR(20),                      -- House/building number (can contain letters like '100A' or 'S/N')
    complemento VARCHAR(100),                -- Apartment, block, etc.
    bairro VARCHAR(100),                     -- Neighborhood
    cidade VARCHAR(100) NOT NULL,            -- City
    estado CHAR(2) NOT NULL,                 -- State abbreviation (e.g., 'SP')
    geom GEOMETRY(Point, 4326)               -- Coordinates (Longitude, Latitude)
);
```

## 2. Create the Indexes
To optimize queries matching both address text strings and geographic coordinates, you must create distinct indexes:

```sql
-- Spatial index for radius and coordinate lookups
CREATE INDEX idx_enderecos_geom ON enderecos_brasil USING GIST (geom);
-- B-Tree indexes for fast text searches on CEP and State/City
CREATE INDEX idx_enderecos_cep ON enderecos_brasil (cep);
CREATE INDEX idx_enderecos_cidade_estado ON enderecos_brasil (estado, cidade);
```

## 3. Projections: 4326 vs 4674 vs 31983

* SRID 4326 (WGS 84): Best for standard web storage and integration with external APIs (like Google Maps or OpenStreetMap). Coordinates are stored as (Longitude, Latitude).
* SRID 4674 (SIRGAS 2000): The official statutory geodetic system for Brazil. It is also a degree-based geographic coordinate system. If you import official datasets from the IBGE (like CNEFE data) or INDE, they will typically come in SIRGAS 2000.
* SRID 31980 to 31985 (SIRGAS 2000 / UTM zones): If you need to calculate highly precise metrics (like exact buffers or distances in meters instead of degrees), project your data locally using the appropriate UTM zone for Brazil (e.g., UTM 23S is SRID 31983, which covers São Paulo and parts of Rio de Janeiro and Minas Gerais). [3, 4] 

## 4. Querying Examples for Brazil
Scenario A: Find addresses within 1.5 km of a specific point in São Paulo (Metric-accurate using ST_Transform to UTM zone 23S)

```sql
SELECT id, logradouro, numero, cep,
       ST_Distance(ST_Transform(geom, 31983), ST_Transform(ST_SetSRID(ST_MakePoint(-46.59, -23.59), 4326), 31983)) as distancia_metros
FROM enderecos_brasil
       -- Index-backed filter using the bounding box operator
WHERE geom && ST_Expand(ST_SetSRID(ST_MakePoint(-46.59, -23.59), 4326), 0.015) 
  AND ST_DWithin(ST_Transform(geom, 31983), ST_Transform(ST_SetSRID(ST_MakePoint(-46.59, -23.59), 4326), 31983), 1500);
```

Scenario B: Filter by a specific bounding box (e.g., viewing a specific neighborhood map segment)

```sql

SELECT logradouro, numero, bairro 
FROM enderecos_brasil 
-- && operator only evaluates the bounding box, making this lightning fast
WHERE geom && ST_MakeEnvelope(-46.61, -23.60, -46.55, -23.55, 4326);
```


## 5. Sourcing Brazilian Address Data
If you do not have your own geocoded coordinates for your text addresses, you can populate your database with open-source datasets: [3] 

* IBGE's CNEFE: The Cadastro Nacional de Endereços para Fins Estatísticos provides millions of validated Brazilian addresses.
* OpenStreetMap (OSM): You can download the country-wide [Geofabrik Brazil dataset](https://download.geofabrik.de/south-america/brazil.html) (packaged as .osm.pbf) and extract road strings and coordinate geometries directly into PostGIS via toolchains like osm2pgsql. [4, 5, 6, 7] 

[1] [https://www.mdpi.com](https://www.mdpi.com/2220-9964/8/11/513)
[2] [https://wiki.openstreetmap.org](https://wiki.openstreetmap.org/wiki/Brazil/PostGIS-testes)
[3] [https://sol.sbc.org.br](https://sol.sbc.org.br/index.php/latinoware/article/download/26113/25936/)
[4] [https://github.com](https://github.com/ipeaGIT/geocodebr)
[5] [https://download.geofabrik.de](https://download.geofabrik.de/south-america/brazil.html)
[6] [https://community.openstreetmap.org](https://community.openstreetmap.org/t/osm2pgsql-postgres-and-postgis-brazil/89494)
[7] [https://postgis.net](https://postgis.net/docs/manual-3.0/Extras.html)
[8] [https://dohost.us](https://dohost.us/index.php/2025/11/16/performing-geocoding-and-reverse-geocoding-with-postgis-introduction/)


---
# Choosing Nominatim or Python Scripts to PostGIS

Choosing between hosting your own Nominatim server or using Python scripts to parse and geocode addresses depends on your data volume, budget, and performance needs.
The primary difference is infrastructure complexity versus runtime dependencies. A Nominatim server provides an offline, self-hosted search engine API, while Python scripts typically call third-party APIs (like Google Maps or Mapbox) or process static local text files sequentially.
Here is a breakdown of the pros, cons, and core differences to help you decide.
------------------------------
## Option 1: Self-Hosted Nominatim Server
Nominatim is an open-source search engine for OpenStreetMap (OSM) data. You download the Brazil map data from a provider like Geofabrik and host the engine locally.

* Pros:
* Zero operational cost: No per-query fees regardless of whether you geocode 10,000 or 50 million addresses.
   * Total data privacy: Address data never leaves your infrastructure, which is ideal for compliance with Brazil's LGPD (General Data Protection Law).
   * Massive throughput: You can query your own server thousands of times per second without hitches or rate-limiting blockades.
* Cons:
* Heavy hardware requirements: Hosting Nominatim for all of Brazil requires significant RAM (minimum 32GB to 64GB) and fast NVMe storage for index generation.
   * Steep setup and maintenance: Installation via Docker or source code requires system administration experience. Keeping map data updated involves configuring continuous replication pipelines.
   * String sensitivity: Standard Nominatim can struggle with poorly formatted Brazilian address variants (e.g., abbreviations like "Av. Prof. Luiz Ignácio" vs "Avenida Professor Luiz Inacio").

------------------------------
## Option 2: Python Scripts (Calling External Geocoding APIs)
This approach involves using libraries like geopy to send your raw text strings to an external commercial API (Google Maps, LocationIQ, OpenCage) and saving the coordinates back into PostGIS.

* Pros:
* Superior address matching: Commercial APIs (especially Google Maps) have unmatched understanding of messy Brazilian address variations, common typos, and missing CEP codes.
   * Zero infrastructure overhead: You only need a simple Python script running on a lightweight machine. No heavy servers to maintain.
   * Quick implementation: You can write, test, and execute the pipeline script within an hour using basic requests or pandas.
* Cons:
* Prohibitively expensive at scale: Commercial APIs charge per request. Geocoding millions of legacy records can easily result in thousands of dollars in monthly bills.
   * Strict rate limits: Even if using free or cheap tiers, you are forced to throttle your script (e.g., adding time.sleep(1) between requests), making bulk data conversion slow.
   * Third-party reliance: You pass sensitive user location data out of your environment, introducing external compliance risks and downtime vulnerabilities.

------------------------------
## Core Differences at a Glance

| Feature | Self-Hosted Nominatim Server | Python + External API Scripts |
|---|---|---|
| Primary Cost | Infrastructure & Engineering time | Per-query API licensing fees |
| Setup Time | Days (Complex configuration) | Hours (Simple code) |
| Address Tolerance | Low (Requires strict formatting) | High (Handles typos/slang well) |
| Speed/Throughput | Blazing fast (Limited only by hardware) | Slow (Bottlenecked by network & API rates) |
| Offline Capability | Yes | No |

------------------------------
## Which should you choose?

* Choose the Python Script approach if: You have a small dataset (under 50,000 addresses) or require highly tolerant fuzzy-text matching for unstructured user inputs where typos are frequent.
* Choose a Self-Hosted Nominatim Server if: You are handling bulk operations (hundreds of thousands of addresses daily), have strict data privacy requirements, or cannot justify ongoing API usage bills.

---
# Fully local, self-contained geocoding database

The idea is to bypass Nominatim entirely and build a fully local, self-contained geocoding database directly inside my PostGIS instance using open-source datasets [5].
This gives you a completely private database with zero rate limits, zero network lag, and zero external dependencies [5].

To do this for Brazil, you will load the raw map assets directly into PostGIS tables and use SQL's native pattern matching and text search functions to resolve addresses [5].
------------------------------
## 1. The Strategy: Street-Level Interpolation
To convert an address like "Avenida Paulista, 1000" into coordinates without Nominatim, your database needs two components:

   1. The Street Centerline: A line geography representing the entire street (ST_LineString).
   2. The Number Ranges: Metadata on that line showing the starting and ending house numbers on both the left and right sides of the street.

When a user searches for number 1000 on a street block that ranges from number 0 to 2000, PostGIS calculates exactly 50% along that road line using ST_LineInterpolatePoint and returns that exact coordinate.
------------------------------
## 2. Step-by-Step Implementation## Step A: Download OpenStreetMap Raw Data for Brazil
Download the country file in .osm.pbf format from a mirror like Geofabrik:

* Source: https://geofabrik.de

## Step B: Import the Raw Data into PostGIS
Instead of building a heavy Nominatim engine, use osm2pgsql, a lightweight command-line tool that parses OSM files directly into standard PostGIS tables.
Run this command in your terminal:

osm2pgsql -c -d your_database_name -U your_user -H localhost -W --slim brazil-latest.osm.pbf

This automatically generates optimized spatial tables in your database:

* planet_osm_point (Points of interest, specific building numbers)
* planet_osm_line (Streets, highways, rivers)
* planet_osm_polygon (Neighborhoods, city boundaries, administrative zones)

## Step C: Build Text Search Indexes
To handle variations in Brazilian address strings (like abbreviations or typos), create standard text search indexes on the street names and cities:

-- Create a generalized inverted index (GIN) for fast fuzzy text matchingCREATE INDEX idx_osm_line_name_trgm ON planet_osm_line USING gin (name gin_trgm_ops);CREATE INDEX idx_osm_polygon_name_trgm ON planet_osm_polygon USING gin (name gin_trgm_ops);

(Note: Ensure you run CREATE EXTENSION pg_trgm; first to enable trigram fuzzy matching).
------------------------------
## 3. Querying Your Local PostGIS Geocoder
Once your data is loaded, you bypass APIs completely. You can find the coordinates of a street using pure SQL:

SELECT 
    name as logradouro,
    highway,
    -- Returns the geographic center point of the street block
    ST_Transform(ST_Centroid(way), 4326) as geomFROM 
    planet_osm_lineWHERE 
    name ILIKE '%Luiz Ignácio Anhaia Mello%' -- Fuzzy street match
    AND highway IS NOT NULL                 -- Ensures it is an actual roadLIMIT 1;

------------------------------
## 4. Alternative: The Official Government Route (IBGE CNEFE)
If you want the absolute highest precision for Brazilian addresses, bypass OpenStreetMap and use the CNEFE (Cadastro Nacional de Endereços para Fins Estatísticos) provided by the IBGE.

* What it is: A massive CSV/Shapefile dataset containing practically every registered address door in Brazil, collected during national censuses.
* Why it's better: It contains the actual points of the houses, so you don't even have to interpolate or guess where a street number is.
* How to use it: Download the sector files for your target Brazilian states from the IBGE portal, and use the standard PostgreSQL COPY command to pipe the text fields and coordinate columns straight into your enderecos_brasil table.

------------------------------
## Pros and Cons of a Pure PostGIS Setup

* Pros:
* Blazing Fast: Lookups take milliseconds because they are local SQL queries hitting RAM-cached indices [5].
   * Low Resource Footprint: Unlike Nominatim (which requires 32GB–64GB of RAM), a raw PostGIS database with Brazil OSM data can comfortably run on a machine with 4GB–8GB of RAM.
   * Total Control: You can modify your SQL queries to prioritize specific states, match custom local naming conventions, or combine OSM data with your own proprietary datasets.
* Cons:
* No Built-in "Magic" Parser: Nominatim has thousands of lines of complex C/PHP code dedicated strictly to splitting words like "Av.", "Rua", or "São Paulo/SP" from raw strings. In a pure PostGIS setup, you have to write the text-splitting logic or cleanup rules yourself in SQL or Python before querying the tables.

You can write the SQL query for address interpolation using the imported OSM lines, or  you can parse and import the official IBGE CNEFE dataset.

---
# Implementation Python Script

To transition to a completely local, self-contained PostGIS solution the Python script below will be used. It will no longer make web requests via geopy or connect to external APIs. Instead, it will use fuzzy text matching against your local OpenStreetMap tables (imported via osm2pgsql) using PostgreSQL's native pg_trgm (trigram) extension.
## 1. Database Prerequisite
Before running the script, you must enable the trigram extension in your PostgreSQL instance. This allows the database to find close matches for typos or abbreviations (e.g., matching "Av." with "Avenida"):

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Make sure you have also run osm2pgsql as detailed in the previous step, which populates the planet_osm_line table.
## 2. The Pure PostGIS Python Script

```python
import loggingfrom psycopg2 import connect, extras
# 1. Setup Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
# 2. Database Connection ConfigurationDB_CONFIG = {
    "dbname": "your_database_name",
    "user": "your_user",
    "password": "your_password",
    "host": "localhost",
    "port": 5432
}
def local_geocode_batch():
    try:
        conn = connect(**DB_CONFIG)
        cursor = conn.cursor(cursor_factory=extras.RealDictCursor)
        
        # Fetch up to 1000 addresses that haven't been geocoded yet
        cursor.execute("""
            SELECT id, logradouro, numero, bairro, cidade, estado 
            FROM enderecos_brasil 
            WHERE geom IS NULL
            LIMIT 1000;
        """)
        records = cursor.fetchall()
        
        if not records:
            logging.info("No pending addresses found to geocode.")
            return

        logging.info(f"Processing {len(records)} addresses using local PostGIS tables...")

        for row in records:
            # Clean up abbreviations commonly used in Brazil to improve match score
            street_clean = row['logradouro'].replace("R.", "Rua").replace("Av.", "Avenida").strip()
            city_clean = row['cidade'].strip()
            
            logging.info(f"Geocoding ID {row['id']}: {street_clean}, {city_clean} - {row['estado']}")

            # This query uses the % operator (trigram similarity) to find the closest street centerline.
            # It ranks by how similar the text is and filters to ensure we are matching a road.
            local_lookup_query = """
                SELECT 
                    ST_X(ST_Transform(ST_Centroid(way), 4326)) as lon,
                    ST_Y(ST_Transform(ST_Centroid(way), 4326)) as lat
                FROM 
                    planet_osm_line
                WHERE 
                    highway IS NOT NULL
                    AND name % %s  -- Trigram similarity operator (uses GIN index)
                ORDER BY 
                    similarity(name, %s) DESC
                LIMIT 1;
            """
            
            cursor.execute(local_lookup_query, (street_clean, street_clean))
            match = cursor.fetchone()
            
            if match:
                logging.info(f"--> Local Match Found! Lat: {match['lat']}, Lon: {match['lon']}")
                
                # Update our main address table with the computed geometry point
                cursor.execute("""
                    UPDATE enderecos_brasil
                    SET geom = ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                    WHERE id = %s;
                """, (match['lon'], match['lat'], row['id']))
                
                # Commit frequently to flush changes to disk
                conn.commit()
            else:
                logging.warning(f"--> No local street match found for ID {row['id']}. Skipping.")

    except Exception as error:
        logging.error(f"Database or execution crash: {error}")
        if 'conn' in locals() and conn:
            conn.rollback()
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            conn.close()
        logging.info("Local batch geocoding run finished.")
if __name__ == "__main__":
    local_geocode_batch()
```
## Why this approach scales infinitely

* No time.sleep(): Notice that the 1-second timeout loop is gone. Because all calculations take place entirely within your server hardware, this script can process hundreds of addresses per second rather than 1 per second.
* Cost Free: You can loop over 50 million records without receiving an API bill or getting blocked by OpenStreetMap's servers.
* Deterministic Results: If a street name updates or you discover missing data, you can simply append rows directly to planet_osm_line yourself.

To maximize performance, make sure to add a trigram index to your lookup field so the database doesn't scan the entire map of Brazil for every row.

To make your local database queries run in milliseconds instead of seconds, you must create a GIN (Generalized Inverted Index) using Trigram Operations.
Without this index, PostgreSQL has to perform a "Sequential Scan"—meaning it will read through every single street line in Brazil to calculate the text similarity for every single address you process.
Run these two SQL commands in your database terminal to enable the extension and build the index:

-- 1. Enable the trigram extension (if you haven't already)
```sql
CREATE EXTENSION 
IF NOT EXISTS pg_trgm;
-- 2. Build the GIN Trigram index on the street names column
CREATE INDEX IF NOT EXISTS idx_planet_osm_line_name_trgm 
ON planet_osm_line 
USING GIN (name gin_trgm_ops)
WHERE highway 
IS NOT NULL; 
-- Partial index: skips non-roads (rivers, rails) to save disk space
```

## Why this index works so well for Brazilian text
Trigrams break strings down into 3-character chunks. For example, the street name "Anhaia" is broken down into: _an, anh, nha, hai, aia.
When your Python script queries a messy user address containing typos (like "Anhaia" spelled as "Anhaia" or "Anaya"), the GIN index instantly finds the rows in planet_osm_line that share the highest number of matching 3-character chunks.
## Performance Maintenance Tip
After creating the index, tell PostgreSQL to update its internal query planner metrics by running:

```sql
ANALYZE planet_osm_line;
```

If you plan to scale this out to handle millions of addresses, multiprocessing in Python needs to be implemented to utilize all your server's CPU cores simultaneously.

To process millions of rows at maximum speed, you can split your workload across multiple CPU cores using Python’s multiprocessing module.

Instead of processing addresses one by one, this updated script divides the missing address IDs into equal chunks and assigns each chunk to a dedicated CPU core. Each core establishes its own connection to your local PostGIS instance and handles its batch independently.
## The Multiprocess PostGIS Geocoder Script

```python
import osimport loggingimport mathfrom multiprocessing import Process, cpu_countfrom psycopg2 import connect, extras
# 1. Setup Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - [Process-%(process)d] - %(levelname)s - %(message)s')
# 2. Database Connection ConfigurationDB_CONFIG = {
    "dbname": "your_database_name",
    "user": "your_user",
    "password": "your_password",
    "host": "localhost",
    "port": 5432
}
def geocode_worker(worker_id, id_chunk):
    """
    Worker function executed by each independent process.
    Processes a dedicated list of address IDs.
    """
    if not id_chunk:
        return

    logging.info(f"Worker {worker_id} started. Processing {len(id_chunk)} rows.")
    
    # Crucial: Each process MUST open its own database connection.
    # Connections cannot be safely shared across processes.
    try:
        conn = connect(**DB_CONFIG)
        cursor = conn.cursor(cursor_factory=extras.RealDictCursor)
        
        # Fetch the full address details for the IDs allocated to this worker
        cursor.execute("""
            SELECT id, logradouro, numero, bairro, cidade, estado 
            FROM enderecos_brasil 
            WHERE id = ANY(%s);
        """, (id_chunk,))
        records = cursor.fetchall()

        for row in records:
            street_clean = row['logradouro'].replace("R.", "Rua").replace("Av.", "Avenida").strip()
            
            local_lookup_query = """
                SELECT 
                    ST_X(ST_Transform(ST_Centroid(way), 4326)) as lon,
                    ST_Y(ST_Transform(ST_Centroid(way), 4326)) as lat
                FROM 
                    planet_osm_line
                WHERE 
                    highway IS NOT NULL
                    AND name % %s
                ORDER BY 
                    similarity(name, %s) DESC
                LIMIT 1;
            """
            
            cursor.execute(local_lookup_query, (street_clean, street_clean))
            match = cursor.fetchone()
            
            if match:
                cursor.execute("""
                    UPDATE enderecos_brasil
                    SET geom = ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                    WHERE id = %s;
                """, (match['lon'], match['lat'], row['id']))
                conn.commit()
            else:
                # Optional: log failures to a dedicated table or file here
                pass

    except Exception as error:
        logging.error(f"Worker {worker_id} encountered an error: {error}")
        if 'conn' in locals() and conn:
            conn.rollback()
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            conn.close()
        logging.info(f"Worker {worker_id} completed its chunk.")
def main():
    # Detect available CPU cores. Leave 1 core free for system stability.
    num_workers = max(1, cpu_count() - 1)
    logging.info(f"Initializing parallel execution using {num_workers} CPU cores.")

    try:
        # Step 1: Query only the IDs of rows that need geocoding
        main_conn = connect(**DB_CONFIG)
        main_cursor = main_conn.cursor()
        main_cursor.execute("SELECT id FROM enderecos_brasil WHERE geom IS NULL;")
        all_ids = [row[0] for row in main_cursor.fetchall()]
        
        main_cursor.close()
        main_conn.close()

        if not all_ids:
            logging.info("No missing coordinates found. Database is fully geocoded.")
            return

        total_rows = len(all_ids)
        logging.info(f"Total rows to geocode: {total_rows}")

        # Step 2: Split the array of IDs evenly into chunks for each worker
        chunk_size = math.ceil(total_rows / num_workers)
        chunks = [all_ids[i:i + chunk_size] for i in range(0, total_rows, chunk_size)]

        # Step 3: Spawn and start the parallel worker processes
        processes = []
        for index, id_chunk in enumerate(chunks):
            p = Process(target=geocode_worker, args=(index, id_chunk))
            processes.append(p)
            p.start()

        # Step 4: Wait for all processes to finish before exiting the script
        for p in processes:
            p.join()

        logging.info("All parallel workers have finished processing successfully.")

    except Exception as error:
        logging.error(f"Main execution orchestrator failed: {error}")
if __name__ == "__main__":
    main()
```
## Critical Rules for Parallel PostGIS

   1. Never Share Connections: Notice that main_conn is closed before any processes start, and each geocode_worker creates its own fresh connection. Passing a single active connection down to parallel subprocesses will result in race conditions and immediate database crashes.
   2. Increase max_connections: Each process acts as an independent client. If your server has 16 CPU cores, this script will open 15 concurrent database connections. Verify your PostgreSQL postgresql.conf file allows enough max_connections (the default is usually 100, which is plenty, but worth checking).
   3. Monitor Disk I/O: Your bottleneck will shift from network delays to your hard drive's read/write speed. This script runs exceptionally well on NVMe SSD architectures.

Depending on your production requirements, do need to add fallback queries to search by neighborhood (planet_osm_polygon) if a street name fails to match completely.

To make your geocoder truly resilient, we will implement a tiered fallback system. If the script cannot find a matching street centerline in planet_osm_line, it will automatically drop down and look for a matching neighborhood or city boundary in planet_osm_polygon.
This ensures that even if a street is brand new or missing from OpenStreetMap, the record is still tagged with a usable coordinate point (the geographic center of the neighborhood) instead of remaining blank.
## 1. Database Prerequisite: Polygon Trigram Index
Just like we indexed the street lines, we must create a GIN Trigram index on the polygon table boundaries to keep fallback searches running in milliseconds:

```sql
CREATE INDEX IF NOT EXISTS idx_planet_osm_polygon_name_trgm 
ON planet_osm_polygon 
USING GIN (name gin_trgm_ops)
WHERE boundary = 'administrative' OR landuse IS NOT NULL;
```

## 2. The Multi-Core Script with Neighborhood Fallbacks

```python
import os
import logging
import math
from multiprocessing import Process, cpu_count
from psycopg2 import connect, extras

# 1. Setup Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - [Process-%(process)d] - %(levelname)s - %(message)s')

# 2. Database Connection Configuration
DB_CONFIG = {
    "dbname": "your_database_name",
    "user": "your_user",
    "password": "your_password",
    "host": "localhost",
    "port": 5432
}

def geocode_worker(worker_id, id_chunk):
    if not id_chunk:
        return

    logging.info(f"Worker {worker_id} started. Processing {len(id_chunk)} rows.")
    
    try:
        conn = connect(**DB_CONFIG)
        cursor = conn.cursor(cursor_factory=extras.RealDictCursor)
        
        cursor.execute("""
            SELECT id, logradouro, numero, bairro, cidade, estado 
            FROM enderecos_brasil 
            WHERE id = ANY(%s);
        """, (id_chunk,))
        records = cursor.fetchall()

        for row in records:
            # Clean up raw text components
            street_clean = row['logradouro'].replace("R.", "Rua").replace("Av.", "Avenida").strip()
            bairro_clean = row['bairro'].strip() if row['bairro'] else ""
            cidade_clean = row['cidade'].strip()

            # --- TIER 1: Primary Search (Street Line Matching) ---
            street_query = """
                SELECT 
                    ST_X(ST_Transform(ST_Centroid(way), 4326)) as lon,
                    ST_Y(ST_Transform(ST_Centroid(way), 4326)) as lat
                FROM planet_osm_line
                WHERE highway IS NOT NULL AND name % %s
                ORDER BY similarity(name, %s) DESC LIMIT 1;
            """
            cursor.execute(street_query, (street_clean, street_clean))
            match = cursor.fetchone()
            
            # --- TIER 2: Neighborhood Fallback (Polygon Matching) ---
            if not match and bairro_clean:
                neighborhood_query = """
                    SELECT 
                        ST_X(ST_Transform(ST_Centroid(way), 4326)) as lon,
                        ST_Y(ST_Transform(ST_Centroid(way), 4326)) as lat
                    FROM planet_osm_polygon
                    WHERE (boundary = 'administrative' OR landuse = 'residential') 
                      AND name % %s
                    ORDER BY similarity(name, %s) DESC LIMIT 1;
                """
                cursor.execute(neighborhood_query, (bairro_clean, bairro_clean))
                match = cursor.fetchone()
                if match:
                    logging.info(f"ID {row['id']}: Street missed. Fell back to Neighborhood: {bairro_clean}")

            # --- TIER 3: City Fallback (Polygon Matching) ---
            if not match:
                city_query = """
                    SELECT 
                        ST_X(ST_Transform(ST_Centroid(way), 4326)) as lon,
                        ST_Y(ST_Transform(ST_Centroid(way), 4326)) as lat
                    FROM planet_osm_polygon
                    WHERE boundary = 'administrative' AND admin_level = '8' -- Admin level 8 is City in Brazil OSM
                      AND name % %s
                    ORDER BY similarity(name, %s) DESC LIMIT 1;
                """
                cursor.execute(city_query, (cidade_clean, cidade_clean))
                match = cursor.fetchone()
                if match:
                    logging.info(f"ID {row['id']}: Street/Bairro missed. Fell back to City Center: {cidade_clean}")

            # --- Apply geometry if any tier succeeded ---
            if match:
                cursor.execute("""
                    UPDATE enderecos_brasil
                    SET geom = ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                    WHERE id = %s;
                """, (match['lon'], match['lat'], row['id']))
                conn.commit()
            else:
                logging.warning(f"ID {row['id']}: Completely unresolvable address.")

    except Exception as error:
        logging.error(f"Worker {worker_id} crashed: {error}")
        if 'conn' in locals() and conn:
            conn.rollback()
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            conn.close()

def main():
    num_workers = max(1, cpu_count() - 1)
    logging.info(f"Initializing cascading geocoder using {num_workers} CPU cores.")

    try:
        main_conn = connect(**DB_CONFIG)
        main_cursor = main_conn.cursor()
        main_cursor.execute("SELECT id FROM enderecos_brasil WHERE geom IS NULL;")
        all_ids = [row[0] for row in main_cursor.fetchall()]
        main_cursor.close()
        main_conn.close()

        if not all_ids:
            logging.info("No addresses require geocoding.")
            return

        total_rows = len(all_ids)
        chunk_size = math.ceil(total_rows / num_workers)
        chunks = [all_ids[i:i + chunk_size] for i in range(0, total_rows, chunk_size)]

        processes = []
        for index, id_chunk in enumerate(chunks):
            p = Process(target=geocode_worker, args=(index, id_chunk))
            processes.append(p)
            p.start()

        for p in processes:
            p.join()

        logging.info("All parallel workers completed successfully.")
    except Exception as error:
        logging.error(f"Orchestrator failed: {error}")

if __name__ == "__main__":
    main()
```

## How the Fallback System Helps You

* Protects UI components: Maps will no longer fail to load coordinates or default to (0,0) in the Atlantic Ocean for tricky addresses.
* Brazil OpenStreetMap Nuance: The script targets admin_level = '8' for city queries. In the OpenStreetMap schema for Brazil, administrative level 8 specifically refers to municipal/city borders (municípios).

Now that your database is fully geocoded, you can run high-performance spatial queries using PostGIS.
Because we created the GiST spatial index on your geom column, these queries do not scan the entire table. Instead, they quickly search the geometric bounding boxes first, returning results in milliseconds.
Here are the three most common spatial queries you will use for a Brazilian address application.
------------------------------
## Query 1: Nearest Neighbor Search (The KNN Operator)
If you want to find the closest addresses to a specific user coordinate (e.g., "Find the nearest 5 delivery addresses to a courier"), use the <-> distance operator.
When used in the ORDER BY clause, <-> tells the PostGIS GiST index to perform an index-accelerated K-Nearest Neighbor (KNN) search.

```sql
SELECT 
    id, 
    logradouro, 
    numero, 
    cidade,
    -- Calculate exact distance in meters using geography type cast
    ST_Distance(geom::GEOGRAPHY, ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4326)::GEOGRAPHY) AS distancia_metros
FROM 
    enderecos_brasil
ORDER BY 
    -- <-> utilizes the spatial index for instant distance ranking
    geom <-> ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4326)
LIMIT 5;
```

------------------------------
## Query 2: Exact Radius Search (Using Metrics)
To find all addresses within a specific radius (e.g., "Find all customers within 2.5 kilometers of our store"), use ST_DWithin.
Casting the coordinates to GEOGRAPHY forces PostGIS to use meters instead of degrees, automatically handling the Earth's curvature.

```sql
SELECT 
    id, 
    logradouro, 
    bairro,
    ST_Distance(geom::GEOGRAPHY, ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4326)::GEOGRAPHY) AS distancia_metros
FROM 
    enderecos_brasil
WHERE 
    -- ST_DWithin automatically calls the GiST bounding box operator underlyingly
    ST_DWithin(
        geom::GEOGRAPHY, 
        ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4326)::GEOGRAPHY, 
        2500 -- Radius in METERS (2.5 km)
    )
ORDER BY 
    distancia_metros ASC;
```
------------------------------
## Query 3: Point-in-Polygon Search (Polygon Lookup)
If you have custom service delivery zones, city sectors, or neighborhoods mapped out as polygons in another table (regioes_entrega), you can instantly identify which delivery zone a specific address belongs to using ST_Contains or ST_Intersects.

```sql
SELECT 
    e.id AS endereco_id,
    e.logradouro,
    r.nome_regiao,       -- Name of your custom polygon zone
    r.valor_frete        -- Delivery fee assigned to that zone
FROM 
    enderecos_brasil e
JOIN 
    regioes_entrega r 
ON 
    -- Evaluates true if the address point falls inside the polygon boundary
    ST_Contains(r.geom, e.geom)
WHERE 
    e.id = 14502;        -- Target address ID
```

------------------------------
## Key Optimization Checklists for Production

* Never use ST_Distance in a WHERE clause: Writing WHERE ST_Distance(a, b) < 1000 disables the index entirely and forces a slow full-table scan. Always use ST_DWithin instead.
* Keep points and polygons aligned: Ensure your lookup geometries and your address tables share the exact same coordinate tracking system (SRID 4326). If they do not, wrap your parameters in ST_Transform(geom, 4326).

---
# System Design MVP
A complete solution, from frontend GPS capture to backend proximity search.

## High-Level Architecture

```
Browser (GPS) → API Gateway → Location Service → Database (Spatial Index)
                ↓                              ↓
            Cache Layer                   Provider Catalog
```

## Core Components

### 1. Frontend: Getting User Location

```javascript
// Request GPS with proper error handling
function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      }),
      error => {
        switch(error.code) {
          case error.PERMISSION_DENIED: reject('User denied location');
          case error.POSITION_UNAVAILABLE: reject('Location unavailable');
          case error.TIMEOUT: reject('Location timeout');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
```

### 2. Database Schema with Spatial Indexing

For **PostgreSQL with PostGIS** (recommended):

```sql
CREATE TABLE service_providers (
    id UUID PRIMARY KEY,
    name VARCHAR(255),
    category VARCHAR(100),
    location GEOGRAPHY(POINT, 4326),  -- WGS84 coordinate system
    address TEXT,
    rating DECIMAL(2,1),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Critical: Create spatial index
CREATE INDEX idx_providers_location ON service_providers 
USING GIST (location);

-- Also index for filtering
CREATE INDEX idx_providers_category ON service_providers(category);
CREATE INDEX idx_providers_active ON service_providers(is_active);
```

### 3. Backend Proximity Query

**Option A: PostGIS (best for accurate distance)**

```python
from sqlalchemy import text

def find_nearby_providers(lat, lng, radius_km=5, category=None, limit=50):
    query = """
        SELECT 
            id, name, category, rating, phone,
            ST_Distance(location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) as distance_meters,
            ST_AsText(location) as coordinates
        FROM service_providers
        WHERE 
            is_active = true
            AND ST_DWithin(
                location, 
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                :radius_meters
            )
    """
    
    params = {
        'lat': lat, 
        'lng': lng, 
        'radius_meters': radius_km * 1000
    }
    
    if category:
        query += " AND category = :category"
        params['category'] = category
    
    query += " ORDER BY distance_meters LIMIT :limit"
    params['limit'] = limit
    
    return db.execute(text(query), params).fetchall()
```

**Option B: MongoDB (simpler, less accurate)**

```javascript
// Using 2dsphere index
db.service_providers.createIndex({ location: "2dsphere" });

db.service_providers.find({
  location: {
    $near: {
      $geometry: { type: "Point", coordinates: [lng, lat] },
      $maxDistance: radiusMeters
    }
  },
  is_active: true
}).limit(50);
```

### 4. Complete API Endpoint

```python
from fastapi import FastAPI, HTTPException, Depends
from typing import Optional

app = FastAPI()

@app.get("/api/providers/nearby")
async def get_nearby_providers(
    lat: float,
    lng: float,
    radius_km: float = 5.0,
    category: Optional[str] = None,
    limit: int = 50,
    user_id: str = None  # For caching per user
):
    # Validate coordinates
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates")
    
    # Check cache for repeated requests (user might refresh)
    cache_key = f"nearby:{lat},{lng}:{radius_km}:{category}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)
    
    # Query database
    providers = find_nearby_providers(lat, lng, radius_km, category, limit)
    
    # Format response
    response = {
        "user_location": {"lat": lat, "lng": lng},
        "radius_km": radius_km,
        "providers": [
            {
                "id": p.id,
                "name": p.name,
                "category": p.category,
                "distance_meters": p.distance_meters,
                "distance_km": round(p.distance_meters / 1000, 1),
                "rating": p.rating,
                "phone": p.phone
            } for p in providers
        ],
        "total_count": len(providers)
    }
    
    # Cache for 30 seconds (locations change slowly)
    await redis.setex(cache_key, 30, json.dumps(response))
    return response
```

## Advanced Design Considerations

### Performance Optimizations

**1. Geohash/Grid-based Pre-filtering**
```sql
-- Add geohash column for faster bounding box filtering
ALTER TABLE service_providers ADD COLUMN geohash VARCHAR(12);
CREATE INDEX idx_geohash ON service_providers(geohash);

-- Query: first filter by geohash prefix, then precise distance
WHERE geohash LIKE :prefix AND ST_DWithin(...)
```

**2. Reverse Geocoding Cache**
```python
# Convert GPS to neighborhood/zip code to cache results
async def get_location_context(lat, lng):
    # Use reverse geocoding API (Google/Mapbox)
    # Cache neighborhood-level results, not exact coordinates
    # Example: "Brooklyn, NY" vs exact (40.6782, -73.9442)
```

**3. Materialized Views for Popular Queries**
```sql
-- Refresh every 5 minutes via cron
CREATE MATERIALIZED VIEW nearby_providers_cache AS
SELECT p.*, ST_X(p.location::geometry) as lng, ST_Y(p.location::geometry) as lat
FROM service_providers p
WHERE is_active = true;
```

### Handling Scale (100k+ providers, 10k+ concurrent users)

```
Load Balancer
       ↓
API Gateway (Rate limiting, auth)
       ↓
Location Service (Stateless, auto-scale)
       ↓
┌──────────────┬──────────────┬──────────────┐
│  Redis        │  PostgreSQL  │   Elastic    │
│  (Session,    │  (Primary    │   Search     │
│   Hot cache)  │   store)     │   (Geo query)│
└──────────────┴──────────────┴──────────────┘
```

**Elasticsearch alternative for massive scale:**
```json
PUT /providers
{
  "mappings": {
    "properties": {
      "location": { "type": "geo_point" },
      "category": { "type": "keyword" }
    }
  }
}

GET /providers/_search
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "category": "plumber" } },
        { "geo_distance": {
            "distance": "5km",
            "location": { "lat": 40.7128, "lon": -74.0060 }
        }}
      ]
    }
  }
}
```

### Privacy & UX Considerations

1. **Permission handling** - Request location only when needed, explain why
2. **Fallback** - Allow manual address entry if GPS denied
3. **Accuracy indicators** - Show user how accurate their location is
4. **Battery/Data optimization** - Throttle GPS updates (watchPosition with max 1 update/minute)
5. **GDPR/CCPA compliance** - Don't store precise locations longer than needed

### Deployment Architecture (Docker Compose)

```yaml
version: '3.8'
services:
  postgres:
    image: postgis/postgis:15-3.4
    environment:
      POSTGRES_DB: provider_catalog
      POSTGRES_PASSWORD: secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  
  api:
    build: ./api
    environment:
      DATABASE_URL: postgresql://user:pass@postgres/provider_catalog
      REDIS_URL: redis://redis:6379
    ports:
      - "8000:8000"
    depends_on:
      - postgres
      - redis
```

## Quick MVP Implementation Path

If building minimal version:

1. **Week 1**: PostgreSQL + PostGIS, basic provider table with lat/lng columns
2. **Week 2**: Simple distance calculation (Haversine formula in SQL)
3. **Week 3**: Frontend GPS + basic list display
4. **Week 4**: Add filtering, caching, pagination

Start with simple bounding box, then add spatial index when data grows beyond 10k providers.

Would you like me to elaborate on any specific component - like implementing reverse geocoding, handling real-time location updates, or scaling to millions of providers?