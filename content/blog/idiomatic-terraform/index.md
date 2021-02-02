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

## Terraform State

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
이렇게 Terraform 폴더 별로 상태 파일 remote를 설정할 수 있습니다.

## Modularization

한 리전에 특정 서비스를 위한 인프라를 구성할 때에는 VPC, DB, 그리고 클라우드 프로바이더 별 서비스에서 제공하는
리소스를 설정하게 됩니다. 그런데 이 구성이, 어느 리전을 가든 거의 비슷할 테죠.
거기다가 dev, stag, prod 등의 스테이지 별로도 각각 인프라를 가질 텐데, 이때도 설정만 조금 다를 뿐 큰 틀에서의 인프라는
모두 같을 겁니다. 당연하죠, 환경 별로 인프라 구성을 다르게 해놓고 테스트를 한다는 것부터 말이 안 되니까요.

결국 여러 리전과 환경에 동일한 인프라 설정을 반복적으로 작성하게 됩니다. 이때 구성 요소를 모듈화해서
불러오고, 설정 변수만 다르게 입력해 준다면 유지보수하기에도 훨씬 용이해지겠죠. 코드형 인프라가 프로그래밍 언어의
특징을 그대로 가져온 덕택에 중복 설정을 모듈화하여 관리할 수 있게 되었습니다. 이를 위해 모듈 폴더와 실제 인프라를
분리합니다. 그리고 인프라도 리전, 스테이지, 서비스에 따라 나눕니다. 그래야 특정 폴더의 상태 파일이 손상되었을 때,
피해를 최소화할 수 있겠죠?

각 폴더는 일반적으로 다음과 같은 파일을 갖습니다.

- main.tf - 실제 리소스
- vars.tf - 입력 변수
- outputs.tf - 출력 변수

물론 리소스 내용이 커지면 main 대신 여러 파일로 분리해도 상관 없습니다. Terraform은 현재 폴더 내의 모든 .tf 파일을 참고하니까요! 예를 들어서 디렉토리 구조는 이런 모습이 됩니다.

- dev
    - vpc
    - database
        - mariadb
            - main.tf
            - (...)

- stag
    - vpc
    - database
        - mariadb
            - main.tf
            - (...)
- prod
    - (...)
- global
    - s3

여기서 일단 mariadb 부분이 중복됨을 확인할 수 있습니다. 뭐, 설정해 준 DB용 인프라 위로 어떤 설정의
DB가 올라갈지는 이미지 파일에 따라 나뉘겠지만, 우선 여기서는 구체적인 설정값 이외에는 기본적인 구성 요소가 같겠죠.

```bash
module "database_mariadb" {
  source = "../../modules/mariadb"
}
```

이러면 모듈의 코드가 그대로 복붙되는 아주 단순한 구조입니다만, 사용에 앞서 **terraform get** 명령으로 모듈을 갖고 와야 합니다. 물론 이를 수정하지 못하는 건 당연히 아닙니다. 모듈은 vars.tf와 outputs.tf 등과 같이 입력과 출력 변수를 정의해 둘 수 있습니다. mariadb/vars.tf에 이런 식으로 변수를 추가합시다.

```bash
variable "database_name" {
  description = "database name"
}
```

이제 해당 모듈을 불러오고, module.database_mariadb.outputs.database_name과 같은 식으로 값을 인용해 올 수 있습니다.

모듈을 불러오지 않고도 다른 리소스의 정보를 활용할 수도 있어요. 사실 모듈을 불러오면, 해당 리소스가 불필요하게 다시 생성되잖아요? 새로운 리소스를 만들지 않고도 원래 구성되어 있던 리소스의 output 값을 불러오는 방법이 있습니다. data에서 terraform_remote_state를 선언해 주세요.

```bash
data "terraform_remote_state" "database_mariadb" {
  backend   = "gcs"
  workspace = "${terraform.workspace}"

  config = {
    bucket = "tf-state"
    prefix = "terraform/dev/database/mariadb"
  }
}
```

이 코드는 원래 존재했던 VPC 리소스의 상태 파일을 읽어 옵니다. 이제, 이 인프라의 output 값을 불러 옵시다. data.terraform_remote_state.database_mariadb.outputs.network_id와 같은 식으로 불러올 수 있습니다.

이런 식으로 리소스들을 캡슐화하고 상태 파일을 안전하게 관리할 수 있어요!!!

## CIDR Range for Private Address Allocation

서브넷 레인지를 막 정하다가 나중에 참사가 터질 수도 있다.
그러니까 애초부터 국제 표준에 맞춰서 지정해 주어야 한다. (RFC 1918)

Terraform에서 서브넷 레인지를 설정해줄 때, 놓치기 쉬운 부분이 있습니다. 어차피 서브넷은 공인 IP 주소와는
전혀 관련이 없다면서 임의의 주소를 막 대입할 수 있는데요. 이러면 혹시라도 나중에 낭패를 볼 수 있습니다.
굳이 공인 IP가 아니더라도 기존에 예약된 주소와 충돌할 수 있거든요.

이 때문에 사설 주소 할당에 관해 IETF에서 **RFC 1918**이란 기준을 마련해 놓았습니다.

10.0.0.0     -  10.255.255.255  (10/8 prefix)
172.16.0.0   -  172.31.255.255  (172.16/12 prefix)
192.168.0.0  -  192.168.255.255 (192.168/16 prefix)

앞으로는 이 대역 안에서만 서브넷을 설정하시면 문제 없을 거에요.

그리고, 서브넷 레인지는 하드코딩 해주지 말고 변수 단에서 numeral을 지정해 주도록 합시다. 예를 들어
1번 서브넷은 0, 2번 서브넷은 16... 이런 식으로 지정해 놓고 아래에서 설명한 count 문과 연계할 수 있습니다.
그러면 코드가 훨씬 읽기 쉬워지니까요.

## Namespace Sanity

그렇습니다. 코드에서든, 인프라에서든, 네임스페이스의 청결함(?)은 중요합니다. 인프라를 이루는 각 리소스는 원래 리소스와 충돌하지 않게 unique한 이름을 가져야 합니다. 만약에 식별자를 하드코딩해 놓으면, Terraform 코드를 apply할 때 교통사고가 일어날 수도 있어요.

사실 리소스를 배포할 때마다 unique한 이름이 만들어지도록 보장하는 건 수동으로 한다면 정말 귀찮은 일이 되겠지요. 이럴 때는 random이 좋아요! Terraform 자체에도 random_string을 가져와 사용할 수 있고, Terratest에서도 random 모듈을 지원합니다. 제가 생각하는 Best Practice는...

- 모든 변수는 하드코딩하지 말고 참조해 오거나 variable로 등록한다.
- Terraform과 Terratest에서 둘 다 고려하지 말고, 그냥 Terraform에서만 미리 random_string을 만들어서 불러 온다!

Terraform에서 random_string을 정의하고 사용하는 코드는 다음과 같습니다.

```bash
resource "random_string" "suffix" {
  length  = 4
  special = false
  upper   = false
}

resource "aws_internet_gateway" "default" {
  vpc_id = aws_vpc.default.id

  tags = {
    Name = "igw-${var.vpc_name}-${random_string.suffix.result}"
  }
}
```

이렇게 하면 새로운 인터넷 게이트웨이 리소스를 생성할 때마다 뒤에 4자리 랜덤 스트링을 붙여 줄 수 있답니다.

## Count

count 문은 선언형 언어에서 enumeration을 통한 리소스 정의를 돕는다.

Terraform 0.12에 새로 추가된 문법입니다. 이 포스트를 작성하는 시점(2021년 2월)엔 나온지 꽤 됐는데요.
결론부터 말하자면 절차형 언어에서의 반복문 비슷한 역할을 합니다. 반복문을 실행하면 탈출 조건이
될 때까지 블럭 안을 뱅뱅 돌겠죠. for 문처럼 iterator를 경계 조건까지 가산시켜 가며 반복할 수도 있습니다.

선언형 언어인 Terraform(정확히는 HCL)에서 count 문은, iteration보다는 enumeration의 의미를 갖습니다. 왜냐하면

- 코드 순서를 바꾸어도 결과가 같습니다. 즉 시간적 커플링이 형성되지 않습니다.
- 몇 번을 실행해도 얻는 결과물(리소스)은 같습니다. 즉 idempotency가 성립합니다.

그렇기 때문에 실제로는 count 문을 사용한 리소스가 length만큼 **복붙**되어 정의된다고 이해할 수 있습니다. 예시를 들어보면,

```bash
resource "aws_subnet" "public" {
  count  = length(var.availability_zones)
  vpc_id = aws_vpc.default.id

  cidr_block              = "10.${var.cidr_numeral}.${var.cidr_numeral_public[count.index]}.0/20"
  availability_zone       = element(var.availability_zones, count.index)

  tags = {
    Name = "public${count.index}-${var.vpc_name}"
  }
}
```

리전 내 AZ마다 퍼블릭 서브넷을 정의하려고 합니다. 따라서 서브넷을 AZ의 갯수만큼 설정해 주어야 합니다.
count 문에 AZ 배열의 length가 들어간 것으로도 확인 가능합니다.
각각의 서브넷에 해당하는 CIDR 블럭도 하드코딩되어 있지 않고, 모듈 선언부에서 받은 변수를 대입해 줍니다.

이런 식으로 하드코딩 없이 변수만 수정해 줌으로써 서브넷 설정을 쉽게 변경할 수 있게 되었습니다.