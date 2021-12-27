---
title: 1부. Docker 네트워킹
date: "2020-11-11T11:40:32.000Z"
description: 
tags: ["Docker", "Kubernetes", "네트워크"]
---

Docker는 사용 사례에 따라 다섯 가지 네트워킹 방법을 제공합니다.

![eth0-container](https://res.cloudinary.com/dhc1es6e9/image/upload/v1605069685/blog-img/201111-eth0-container_nv8918.png)

- Host Networking을 하는 컨테이너는 Host와 IP 주소, 네트워크 네임스페이스를 공유합니다. 이 컨테이너에서 돌아가는 서비스는 Host에서의 서비스와 같은 능력을 갖습니다.

    ![communication-between-containers](https://res.cloudinary.com/dhc1es6e9/image/upload/v1605069685/blog-img/201111-communication-between-containers_ltxucu.png)

- Bridge Networking은 Host 내의 Private Network 내의 컨테이너들끼리 이루어집니다. Host 바깥에 있는 서비스와 통신할 때에는 **NAT**(Network Address Translation)를 거칩니다. Bridge Networking은 따로 설정을 하지 않았을 때의 default 옵션이고요, docker0 bridge를 Docker 데몬이 생성하죠.
Docker 컨테이너가 생성될 때는 가상 이더넷 장치인 eth0가 생성되고, Host(Bridge) 내에서는 vethxxx라는 식별자를 갖습니다. 여기서도 Host 안에 있는 컨테이너들과 통신 가능하게 되고요.
밖에서는 컨테이너가 노출되지 않기 때문에, **포트를 노출**해 주어야 합니다. 만약 해당 컨테이너의 80번 포트를 Host의 8080번에 publish하고 싶다면, 다음과 같이 설정하세요.

```bash
docker run --name nginx -p 8080:80 nginx
```

Docker 데몬은 Netfilter에 인바운드/아웃바운드 트래픽 규칙을 설정해서 NAT 등을 자동적으로 수행해 줍니다.

- Custom Bridge Network는 Bridge와 비슷하게 동작하지만, 다른 컨테이너와 명시적으로 연결된 네트워크 상에서 통신합니다. DB 등에 Bridge를 설정하여 보안 등의 이점을 취할 수 있습니다. 예를 들면 Bridge 안에서는 포트를 노출하지 않아도 됩니다. 환경 변수도 공유되고요.
- Container-defined Network는 K8s의 Multi-container Pod와 비슷하게 동작합니다. 즉, 컨테이너끼리 네트워크를 공유하죠.
- 아니면 네트워크를 사용하지 않도록 설정합니다. 이러면 포트를 노출할 수 없어요.

## 컨테이너 간 통신

![docker-bridge](https://res.cloudinary.com/dhc1es6e9/image/upload/v1605069685/blog-img/201111-docker-bridge_ypzrnq.png)

1. 먼저 왼쪽 컨테이너에서의 패킷은 eth0를 통과하여 vethxxx로 유입됩니다.
2. docker0 내에서 vethxxx와 vethyyy가 연결됩니다.
3. vethyyy로 패킷이 이동합니다.
4. 그리고 오른쪽 컨테이너의 eth0로 패킷이 도착합니다.

이는 같은 Host(Bridge)를 공유할 때의 경우입니다. Docker에서는 모든 노드가 동일한 컨테이너 서브넷을 구성하므로, 노드 간 통신(다른 Host 간 통신)을 할 때에는 NAT 과정이 반드시 필요합니다.

## 다른 Host 간의 통신

실제 프로덕션 환경은 분산 컴퓨팅 환경에서 이루어지므로, 다른 Host 간의 통신이 대부분입니다. 이때는 보통 overlay 네트워크를 사용합니다. overlay 네트워크는 L3 네트워크 위에 가상의 L2 네트워크를 올리는 방식으로 구현되는데, 이를 잠깐 알아보겠습니다.

![communication-between-networks](https://res.cloudinary.com/dhc1es6e9/image/upload/v1605069685/blog-img/201111-communication-between-networks_trdsqg.jpg)

L2 통신은 동일한 서브넷 Host를 가질 때 이루어집니다. 이를 **LAN**(Local Area Network)이라고 합니다. LAN 내부에 있는 장치들끼리 연결하기 위해서는 이들의 MAC Address를 저장하고 있는 MAC Table이 필요합니다. Docker 컨테이너들은 각각 가상의 이더넷 장치인 eth0를 갖고 있고 이들의 MAC Address가 Host의 테이블에 저장되죠. 또한 서브넷 내에서 각 장치들이 갖는 IP 주소 또한 resolve되어야 하므로 다음의 3가지 테이블이 필요합니다.

- Routing Table
- ARP Table
- MAC Table

L3 통신은 LAN 바깥, 다른 서브넷을 가지는 장치 사이에서 이루어집니다. 근거리 내에 있는 VLAN들이나, 클라우드 Private Network 내에 있는 서브넷끼리 연결하죠. 따라서 서로 다른 서브넷에 속해 있는 컨테이너끼리 통신하려면, L3에서 라우터를 반드시 거쳐야 합니다. 한편 **overlay 네트워크**에서는 L2 네트워크끼리 라우팅을 거치지 않고 통신이 이루어집니다. Calico, Flannel, Weavenet 등이 주로 사용되는데, 이는 추후에 알아보겠습니다.