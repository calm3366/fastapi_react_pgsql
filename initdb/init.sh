# initdb/init.sql
#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE ${BONDS_DB};
    CREATE DATABASE ${N8N_DB};
EOSQL
