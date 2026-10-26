"""
Epako Voice AI (DysTTS): dysarthric speech in, corrected text and speech in the patient's chosen voice out.
The API is src/api.py; routes and tables are in docs/contract.md. Modules import each other by bare name (run from
src/), so this file deliberately imports nothing: importing one module must not load torch and every model.
"""
