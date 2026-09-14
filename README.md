# Local Kubernetes

Deze map gebruikt de Kubernetes-cluster van Docker Desktop via de huidige
`kubectl`-context: `docker-desktop`.

## Controleren

```powershell
docker context show
kubectl config current-context
kubectl get nodes
```

## Resources toepassen

```powershell
kubectl apply -k .
kubectl get all --namespace airadio
```

## Resources verwijderen

```powershell
kubectl delete -k .
```

Voeg Kubernetes-resources toe aan `kustomization.yaml`; zij worden toegepast
in de namespace `airadio`.
