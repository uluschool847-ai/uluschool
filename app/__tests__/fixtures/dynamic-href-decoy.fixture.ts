export function unrelatedUrl() {
  return "https://example.com/static";
}

const route = "/api/files";

function unregisteredDynamicBuilder(token: string) {
  return `${route}/${token}`;
}

void unregisteredDynamicBuilder;
