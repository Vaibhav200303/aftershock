# Village dashboard

Generated `dashboard-reference.png` before implementation using image generation: a calm, legible island-economy dashboard with parchment surfaces, deep teal controls, rounded typography, simple Overview / Economy / Villagers / Activity navigation, and organized numerical data. The generated sample's illustrative numbers and resources are reference material only; implementation retains the simulation's actual data and calculations.

The overview presents all six existing summary metrics, production, jobs, and wealth. Economy contains money, resource prices, order book, lending and bank activity. Villagers contains needs, stock, slack, the complete original table and per-agent logs, and the expandable connections graph. Activity contains run status, model usage, village snapshot, chain signatures, and round log. All existing controls remain available, including range selection and the Dials drawer. The live island inset stays in the header.

Tabs support arrow keys, Home/End, and accessible selected state. Metrics are keyboard-accessible buttons. Secondary details use disclosures and the villager table has contained horizontal scrolling. Layout adapts to narrower screens; the closed Dials drawer is inert.

Validation: production Vite build; browser inspection with a captured real three-villager, scripted-provider state; overview metrics, economy/resource charts and bank readouts, full villager records, Activity records, metric expansion, range switching, and Dials drawer. Temporary fixture and state files are removed after verification.
