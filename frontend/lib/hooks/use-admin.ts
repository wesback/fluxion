import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  instrumentedApiClient as apiClient,
  ApiError,
  type ListAPIKeysResponse,
  type CreateAPIKeyRequest,
  type CreateAPIKeyResponse,
  type ListWebhooksResponse,
  type WebhookConfig,
  type WebhookConfigCreate,
  type WebhookConfigUpdate,
  type WebhookTestResponse,
  type WebhookDeliveryHistory,
} from '../telemetry/api-client';
import { toast } from 'sonner';

export const adminQueryKeys = {
  apiKeys: ['admin', 'api-keys'] as const,
  webhooks: ['admin', 'webhooks'] as const,
  webhook: (id: number) => ['admin', 'webhooks', id] as const,
  webhookHistory: (id: number) => ['admin', 'webhooks', id, 'history'] as const,
};

const defaultQueryOptions = {
  retry: 2,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10000),
  staleTime: 30 * 1000,
  gcTime: 5 * 60 * 1000,
};

// API Keys hooks
export function useAPIKeys() {
  return useQuery<ListAPIKeysResponse, Error>({
    queryKey: adminQueryKeys.apiKeys,
    queryFn: async () => {
      try {
        return await apiClient.getAPIKeys();
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Failed to fetch API keys';
        toast.error(message);
        throw error;
      }
    },
    ...defaultQueryOptions,
  });
}

export function useCreateAPIKey() {
  const queryClient = useQueryClient();
  return useMutation<CreateAPIKeyResponse, Error, CreateAPIKeyRequest>({
    mutationFn: (data) => apiClient.createAPIKey(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.apiKeys });
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Failed to create API key';
      toast.error(message);
    },
  });
}

export function useDeleteAPIKey() {
  const queryClient = useQueryClient();
  return useMutation<{ message: string }, Error, number>({
    mutationFn: (keyId) => apiClient.deleteAPIKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.apiKeys });
      toast.success('API key deleted successfully');
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Failed to delete API key';
      toast.error(message);
    },
  });
}

// Webhook hooks
export function useWebhooks() {
  return useQuery<ListWebhooksResponse, Error>({
    queryKey: adminQueryKeys.webhooks,
    queryFn: async () => {
      try {
        return await apiClient.getWebhooks();
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Failed to fetch webhooks';
        toast.error(message);
        throw error;
      }
    },
    ...defaultQueryOptions,
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();
  return useMutation<WebhookConfig, Error, WebhookConfigCreate>({
    mutationFn: (data) => apiClient.createWebhook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.webhooks });
      toast.success('Webhook created successfully');
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Failed to create webhook';
      toast.error(message);
    },
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();
  return useMutation<WebhookConfig, Error, { webhookId: number; data: WebhookConfigUpdate }>({
    mutationFn: ({ webhookId, data }) => apiClient.updateWebhook(webhookId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.webhooks });
      toast.success('Webhook updated successfully');
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Failed to update webhook';
      toast.error(message);
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();
  return useMutation<{ message: string }, Error, number>({
    mutationFn: (webhookId) => apiClient.deleteWebhook(webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.webhooks });
      toast.success('Webhook deleted successfully');
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Failed to delete webhook';
      toast.error(message);
    },
  });
}

export function useTestWebhook() {
  return useMutation<WebhookTestResponse, Error, { webhookId: number; testPayload?: Record<string, unknown> }>({
    mutationFn: ({ webhookId, testPayload }) => apiClient.testWebhook(webhookId, testPayload),
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : 'Failed to test webhook';
      toast.error(message);
    },
  });
}

export function useWebhookHistory(webhookId: number, limit: number = 50) {
  return useQuery<WebhookDeliveryHistory[], Error>({
    queryKey: adminQueryKeys.webhookHistory(webhookId),
    queryFn: async () => {
      try {
        return await apiClient.getWebhookHistory(webhookId, limit);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Failed to fetch webhook history';
        toast.error(message);
        throw error;
      }
    },
    ...defaultQueryOptions,
    enabled: webhookId > 0,
  });
}
