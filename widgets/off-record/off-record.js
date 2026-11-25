import { mountDashboard } from '../../scripts/off-record-dashboard.js';

export default async function decorate(widget) {
  await mountDashboard(widget);
}
