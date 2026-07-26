import { createImageProxyHandler } from "../../server/image-proxy";

const handleImageProxyRequest = createImageProxyHandler();

export function POST(request: Request) {
  return handleImageProxyRequest(request);
}
