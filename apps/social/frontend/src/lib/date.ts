export function getCurrentDate() {
  const date = new Date().toLocaleString().split(" ");
  const fullHours = date[1].substring(0, 5);

  return date[0] + " às " + fullHours;
}
