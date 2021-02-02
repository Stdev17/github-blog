---
title: Idiomatic Terraform
date: "2021-02-02T14:49:00.000Z"
description: 
tags: ["Terraform", "IaC"]
---

이번 포스트에서는 코드형 인프라 관리 도구인 Terraform의 전형적인 활용 사례를 공유해볼까 합니다.
저도 프로덕션 환경에서 Terraform을 활용해 본 경험이 많지 않지만, 사용자 각자가 고민해 본 사례를
취합해서 나름의 결론을 내리신다면, 팀 내에서 방향성을 잡는 데 도움이 될 거라 믿고 쓰는 글이에요.

(마 초고는 이 정도 토픽으로 쓸기라. 나중에 괜찮은 idiom 하나 떠오르면 추가해서 정리해서 올리긔)

(머 변수랑 아웃풋 설정하는 건 다들 알거구)

Terraform State

Terraform은 .tfstate 파일에 프로비저닝된 인프라의 상태를 관리합니다. 그런데 여러 사람이 협업하는 환경에서, 이 상태 파일이 달라지게 되면, 충돌이 일어나서 골치가 아프겠죠. 그래서 Terraform에서는 상태 파일을 **원격으로 관리**하는 것을 권합니다. 이를 사용하려면 terraform backend 설정이 필요합니다.

우리는 원격 저장소로 클라우드 스토리지를 사용하겠습니다. 대표적으로 S3, GCS, azurerm 등이 있죠. 각자 사용할 프로바이더에 맞춰 [https://www.terraform.io/docs/providers/](https://www.terraform.io/docs/providers/) 를 참조해 주세요. 먼저 버킷을 생성합니다.

```bash
resource "google_storage_bucket" "tf-state" {
  name          = "tf-state"
  location      = "asia-northeast3"
  
  versioning {
    enabled = true
  }
  
  lifecycle {
    prevent_destory = true
  }
}
```

이제 backend 설정을 추가해 줍니다. backend 설정이 추가되었으므로 terraform init을 실행해 줍니다.

```bash
terraform {
  backend "gcs" {
    bucket  = "tf-state"
    prefix  = "terraform/state"
  }
}
```

클라우드 스토리지의 파일을 변경하고 적용되기까지는 보통 몇 초가 소요됩니다. 이때 다른 팀원이 상태 파일에 접근하게 되면 race condition이 발생합니다. GCS와 azurerm에서는 자동으로 파일 잠금을 지원합니다만, S3는 별도의 리소스를 할당해 주어야 합니다. S3에서는 DynamoDB 테이블로 이를 구현합니다.

```bash
resource "aws_dynamodb_table" "terraform_lock" {
  name = "terraform-lock"
  hash_key = "LockID"
  read_capacity = 2
  write_capacity = 2

  attribute {
    name = "LockID"
    type = "S"
  }
}
```

그리고 backend "s3"에 dynamo_table로 테이블 이름을 지정해 줍니다.

Modularization
Module을 따로 빼서 템플릿 코드를 작성한다. 여기 들어갈 변수는 vars.tf로 미리 빼 둔다.
그리고 dev, prod, 타 리전 등에서 모듈을 가져와서 변수만 따로 적어주면 된다(고정 변수로 놓을 수 있겠다)

한 리전에 특정 서비스를 위한 인프라를 구성할 때에는 VPC, DB, 그리고 클라우드 프로바이더 별 서비스에서 제공하는
리소스를 설정하게 됩니다. 그런데 이 구성이, 어느 리전을 가든 거의 비슷할 테죠.
거기다가 dev, stag, prod 등의 스테이지 별로도 각각 인프라를 가질 텐데, 이때도 설정만 조금 다를 뿐 큰 틀에서의 인프라는
모두 같을 겁니다. 당연하죠, 환경 별로 인프라 구성을 다르게 해놓고 테스트를 한다는 것부터 말이 안 되니까요.

결국 여러 리전과 환경에 동일한 인프라 설정을 반복적으로 작성하게 됩니다. 이때 구성 요소를 모듈화해서
불러오고, 설정 변수만 다르게 입력해 준다면 유지보수하기에도 훨씬 용이해지겠죠. 코드형 인프라가 프로그래밍 언어의
특징을 그대로 가져온 덕택에 중복 설정을 모듈화하여 관리할 수 있게 되었습니다. 이를 위해 모듈 폴더와 실제 인프라를
설정할 

CIDR Range for Private Address Allocation
서브넷 레인지를 막 정하다가 나중에 참사가 터질 수도 있다.
그러니까 애초부터 국제 표준에 맞춰서 지정해 주어야 한다. (RFC 1918)

10.0.0.0        -   10.255.255.255  (10/8 prefix)
172.16.0.0      -   172.31.255.255  (172.16/12 prefix)
192.168.0.0     -   192.168.255.255 (192.168/16 prefix)

그리고, 서브넷 레인지는 하드코딩 해주지 말고 변수 단에서 numeral을 지정해 주도록 한다.

Namespace Sanity
리소스 명이 겹치면 골치 아프다. 그러니까 랜덤한 suffix를 붙여 주는 게 신상에 이롭다.

Count
count문은 선언형 언어에서 enumeration을 통한 리소스 정의를 돕는다.
