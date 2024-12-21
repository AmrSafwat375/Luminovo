This script synchronizes stock levels from an ERP system to Luminovo using Luminovo API.
It reads inventory data from an Excel file (from the ERP system), formats it to match Luminovo's API requirements, and sends updates securely with authentication.
Logs are generated to track errors and successful synchronizations.
Deploy by moving the script to a Windows server, installing Python 3 and dependencies required, and scheduling it with Task Scheduler for execution at regular intervals.
This script can be reusable, configurable, and designed for minimal maintenance.
