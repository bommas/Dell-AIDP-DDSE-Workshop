# Example queries — `nursing-providers`

Sample **Query DSL** and **ES|QL** for the workshop nursing providers index.

Index: `nursing-providers`  
Useful fields: `city`, `state`, `medical_specialty`, `medical_specialty_semantic`, `location` (`geo_point`), `overall_rating`, `avg_patient_rating`

> Note: the sample CSV does **not** include an exact specialty named `Dentist`. The “dentist” examples use **semantic search** on `medical_specialty_semantic` (and/or text match) so you can demo natural-language specialty lookup in Chicago / Austin. Swap the semantic query for an exact `term` on `medical_specialty` when your data has that value.

## How to run

### Query DSL (Dev Tools / Console)

```http
POST nursing-providers/_search
```

Paste the JSON body from any file under `query-dsl/`.

### ES|QL (Dev Tools → ES|QL, or Console)

```http
POST /_query
{
  "query": "...."
}
```

Paste the ES|QL string from any file under `esql/` (as the `query` value, or run directly in the ES|QL editor).

## Files

| Topic | Query DSL | ES\|QL |
|-------|-----------|--------|
| Dentists (semantic) in Chicago | `query-dsl/01-dentists-chicago.json` | `esql/01-dentists-chicago.esql` |
| Dentists (semantic) near Austin (geo) | `query-dsl/02-dentists-austin-area-geo.json` | `esql/02-dentists-austin-area-geo.esql` |
| Chicago **or** Austin area | `query-dsl/03-dentists-chicago-or-austin.json` | `esql/03-dentists-chicago-or-austin.esql` |
| High-rated providers in Chicago | `query-dsl/04-high-rated-chicago.json` | `esql/04-high-rated-chicago.esql` |
| List specialties in Austin, TX | `query-dsl/05-austin-tx-specialties-agg.json` | `esql/05-austin-tx-specialties.esql` |
