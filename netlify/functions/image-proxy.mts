import { createImageProxyHandler } from "../../server/image-proxy";

const handleImageProxyRequest = createImageProxyHandler({
  maxBytes: 19_000_000,
  timeoutMs: 9_000,
});

export default function imageProxy(request: Request) {
  return handleImageProxyRequest(request);
}

export const config = {
  path: "/api/images/proxy",
};
