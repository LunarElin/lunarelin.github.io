# APK 서비스 규칙 재검토

확인일: **2026-10-30**. 보관한 Burger Please! 31.6.0 패키지와 이전 Unity 추출 결과를 다시 읽어 대조했다. 이 문서는 정적 데이터의 숫자·필드·식별자·해시를 중심으로 기록하고, 영상을 통한 서비스 흐름의 보완은 별도로 구분한다. 영상의 직접 관찰과 새 웹게임 규칙은 [RESEARCH.md](../RESEARCH.md), 현재 적용·검증 결과는 [README.md](../README.md)를 함께 참고한다.

브라우저로 직접 확인한 영상에는 0:52의 `No Seats!`, 1:02의 `Clean the table!` 안내와 각 식탁 옆 초록색 현금 더미가 있었다. 이 관찰은 자리 부족·청소 대기·식탁별 대금이라는 서비스 흐름을 보완하며, 아래 APK의 개별 TableArea·MoneyArea 구조와 함께 이번 웹 규칙에 반영했다. 영상 시점·정확한 관찰 범위는 연결한 RESEARCH 문서를 기준으로 한다.

## 실제 본체와 처음 제공된 파일

| 구분 | 파일·메타데이터 | 크기 | SHA-256 |
| --- | --- | ---: | --- |
| 게임 본체 | `Burger+Please!_31.6.0_APKPure.xapk` 안의 `io.supercent.burgeridle.apk` | 190,004,235 bytes | `426bd4308f45b9b8b84dec3819eb893a7c25ff254e7d6c26bc50551448a4d334` |
| 처음 제공된 APK | `uptodown-io.supercent.burgeridle.apk`; 실제 패키지는 `com.uptodown`, 버전 7.41·빌드 741 | 15,560,578 bytes | `dc885921fc2d141a53906675bd555f6f5d3705119f37f892d3edf3e61b342550` |

본체의 XAPK `manifest.json`과 추출한 본체 `AndroidManifest.xml`에서 패키지 **`io.supercent.burgeridle`**, 버전 **31.6.0**, 빌드 **141**이 일치했다. XAPK에는 본체와 `config.arm64_v8a.apk` 29,444,325 bytes가 함께 있다. 본체 해시는 이번에 XAPK 내부의 APK 스트림을 직접 읽어 재계산했다.

처음 파일은 이름과 달리 Uptodown App Store 앱이다. 해당 파일의 AndroidManifest에 `com.uptodown`, 앱 클래스 `com.uptodown.UptodownApp`이 있고, ZIP에는 `libuptodown-native.so`와 `libutd-services-native.so`가 있다. 따라서 그 파일을 버거 플리즈 본체·규칙 데이터의 근거로 사용하지 않는다.

## Unity 원문 위치와 공통 해시

원문 식별자는 APK 분석 산출물의 상대 경로를 기준으로 한다. 외부 분석 폴더는 게임 실행의 의존성이 아니며, 원본 APK·전체 JSONL은 이 저장소에 반입하지 않는다. 초기 조사에서는 원작 그래픽도 반입하지 않았고, 2026-10-31에 요청한 선별 메시의 변환·재사용 범위는 [리소스 기록](../assets/SOURCES.md)을 기준으로 한다.

| 산출물 상대 경로 | SHA-256 |
| --- | --- |
| `unity-resources/monobehaviours.jsonl` | `311041e16ae3a9d95d4a006a9c94739e32a68fb3599a73e7f83a4f8e35c19b3b` |
| `unity-resources/MonoBehaviour/WorkerData_Stage1__45df934f__1.json` | `62f989f3014611d407d3b658a4ace1626e2cb492f42da04e68b0e17fe1c66029` |

아래 식탁·진열대·Stage 기록의 공통 `source`는 **`f60e1eeecaf54344ebfcb50bfcda2221`**이다. 줄 번호는 위 JSONL의 1부터 시작하는 번호이며, `path_id`는 그 source 내부의 Unity 객체 식별자다. 이름이 비어 있는 scene 객체는 JSONL에서 이 두 식별자로 대조했다.

## 첫 지역 식탁의 개별 개방 비용

각 `TableArea`의 `_upgradableObjectDataKey`와 `levelCost[].cost[]`를 직접 확인했다. 아래 비용의 원문 `itemType`은 모두 **0**이다. 웹게임에서는 기존 해석대로 금화에 적용하며, 코드 숫자만으로 원작의 모든 통화·결제 흐름을 복원했다고 설명하지 않는다.

| key | TableArea `path_id` | JSONL 줄 | `levelCost` 최초 개방 / 다음 단계 / 그다음 단계 |
| --- | ---: | ---: | --- |
| `Stage_1_Table_1` | 12893 | 13413 | **5 / 370 / 1200** |
| `Stage_1_Table_2` | 12957 | 13477 | **50 / 450 / 1240** |
| `Stage_1_Table_3` | 12756 | 13276 | **150 / 600 / 1280** |
| `Stage_1_Table_4` | 12098 | 12618 | **200 / 650 / 1350** |

따라서 현재 웹게임의 식탁 4개 범위에서는 여관 비용 5로 첫 식탁을 열고, 나머지를 **50 → 150 → 200**으로 순차 개방하는 데 근거로 사용할 수 있다. 원작 첫 지역에는 4개 뒤의 식탁과 확장 식탁도 정의돼 있지만, 이번 웹게임의 화면·시설 수를 그 전체 목록으로 늘리지는 않는다.

## 식탁별 대금 위치

각 `TableArea.table` 참조를 따라 `Table.moneyArea`를 확인했다. 네 식탁에 서로 다른 `MoneyArea` 객체가 연결돼 있다.

| 식탁 | Table `path_id` / JSONL 줄 | MoneyArea `path_id` / JSONL 줄 |
| --- | --- | --- |
| 1 | 12005 / 12525 | 12671 / 13191 |
| 2 | 11947 / 12467 | 12713 / 13233 |
| 3 | 12817 / 13337 | 12129 / 12649 |
| 4 | 12078 / 12598 | 12610 / 13130 |

이 네 MoneyArea의 직렬화 값은 `addMoneyTime = 0.0020000000949949026`, `moneyValueOffset = 1`이다. 이는 개별 식탁 대금 위치의 근거이며, 실제 접촉 수거 범위·수금 완료 시간·식사 가격 계산식을 이 두 필드만으로 확정하지 않는다.

원문 네 식탁의 `chairs`는 각각 **2개**다. 웹게임은 기존 레이아웃을 유지해 **식탁당 1좌석**을 사용한다. 한 손님이 한 그릇을 받아 먹는 현재 흐름과 함께, 이 차이는 웹게임에 맞춘 재해석으로 남긴다.

## 조수 상한과 진열 상한

`WorkerData_Stage1`의 `source`는 **`5b15b33d4a6b718478273e6de3430e8a`**, `path_id = 1`, JSONL **6394줄**이다.

- `workerMaxEmploy = 5`.
- `_maxCount = [1,2,3,4,5,6,7,8,9,10,11]`.
- `_moveSpeed`는 약 `[1,1.2,1.4,1.6,1.8,2,2.2,2.4,2.6,2.8,3]`이며 Unity 부동소수 표현을 포함한다.

이번에는 동시 조수 상한을 **5명**으로 맞춘다. 직원별 능력치와 기존 공유 훈련 합성은 유지하며, 이 필드만으로 원작의 고용 UI·작업 배정 알고리즘이 복원됐다고 주장하지 않는다.

첫 지역 Counter의 `_maxItemValue`는 `path_id` **12574 / 13012**, JSONL **13094 / 13532줄**에서 모두 **100**이다. 초기에 조사한 **50**은 다른 source `093cd319e0197bf4b8a81dcd7c3b700b`의 Stage10 Counter 예시였으므로 첫 지역 값으로 혼동하면 안 된다. 원문 첫 지역 값 100은 이 기록에 보존하고, 웹 진열 상한은 현재의 **60**을 유지한다.

## 다중 주문과 타이밍의 미확정 범위

첫 지역 `Stage`는 `path_id = 12415`, JSONL **12935줄**이며 다음 값이 있다.

| 필드 | 직렬화 값 |
| --- | ---: |
| `orderCountPerTable` | 1 |
| `orderCountPerTableCount` | 4 |
| `customerSpawnTime` | 3 |
| `maxCustomerCount` | 10 |

IL2CPP 메타데이터의 `BurgerPlease.Order`에는 주문 품목·수량을 위한 필드가 있지만, 위 Stage 필드와 결합하는 정확한 수량 산식·확률·현재 실험군 효과는 이번 정적 분석으로 확정하지 못했다. 그러므로 웹게임의 **손님당 1개 구매**를 유지하고, 원작 주문량을 복원했다고 표시하지 않는다. 원작의 기본 고객 수·유입 시간과 웹게임의 많은 고객·입구 줄 설계도 동일한 규칙으로 취급하지 않는다.

정지 임계·개별 상하차 간격·식탁 정리 시간과 실제 수거 속도를 이번 APK 재조사에서 새로 계측하지 않았다. 새 웹 조작 시간은 계속 별도 설계값으로 구분한다. 기존 정적 TextAsset과 MonoBehaviour에는 일부 생산기 비용 차이도 있으므로, 다른 객체에서 찾은 비용·변형 행을 현재 사용 배열에 일괄 덮어쓰지 않는다.

## 이번 적용과 유지하는 차이

1. 여관의 첫 식탁부터 시작해 나머지 식탁을 개별 비용으로 확장한다.
2. 식사가 끝난 식탁 옆에 해당 식사 대금을 남기고 직접 회수한다.
3. 조수 동시 고용 상한을 원문 필드의 5명으로 맞춘다.

여관 비용 5에는 첫 식탁이 포함되고 추가 식탁은 50·150·200으로 열린다. 깨끗한 빈자리가 없거나 정리할 식탁만 남으면 배식 줄이 기다리고, 청소 또는 식탁 추가 뒤 다시 배식한다. 이는 영상의 안내와 APK 구조를 참고한 웹 구현이며, 실제 원작의 고객별 대기 시간·메시지 표시 조건까지 동일하게 복원한 것은 아니다.

손님당 구매 수량 1개, 식탁당 1좌석, 웹 진열 상한 60, 판타지 전투·마법 성장과 지역 동선은 웹게임의 선택으로 유지한다. 런타임은 웹게임 코드와 직접 제작하거나 출처를 따로 확인한 그래픽을 사용하며, APK의 원문 코드·이미지·모델·음원은 복사하지 않는다. 저장 호환과 실제 화면 검증 결과는 게임 README에서 별도로 보고한다.

## 추가 정적 검토: 주문 수량·시설 충돌·운반 표현

같은 날 앞선 적용 이후, IL2CPP 메서드의 ARM64 명령과 Unity의 기본 컴포넌트를 추가로 읽었다. 위의 **손님당 1개·식탁당 1좌석은 앞선 구현 단계의 기록**이다. 아래 근거는 다중 주문·2좌석 개선을 위한 추가 조사이며, 이후 웹게임의 최종 적용값과 검증 결과는 README를 기준으로 한다. APK를 설치하거나 실행하지 않았고, 네이티브 라이브러리는 분석 입력 바이트로만 사용했다. 원문 메서드 본문과 상용 그래픽은 저장소에 반입하지 않는다.

### 추가 입력의 식별자

아래 경로는 별도 분석 산출물 루트 기준이다. `source`와 `path_id`는 해당 Unity 직렬화 파일 내부 식별자이며, 기본 엔진 컴포넌트는 MonoBehaviour JSONL에 없으므로 `objects.csv`의 줄 번호를 대신 적는다.

| 입력 | SHA-256 |
| --- | --- |
| `raw/arm64/lib/arm64-v8a/libil2cpp.so` | `f884a3729fdf23bf36dedb9592dcd54d439d61219427dbe7b621893aacd8340d` |
| `game-data/il2cpp-dump/dump.cs` | `5c5be9ae66b22cf48a4aca12965746b1ee52285dfe2e03b800eb605fa21be36a` |
| `raw/base/assets/bin/Data/f60e1eeecaf54344ebfcb50bfcda2221` | `e147e3b077588d02d39bae12492f7e14393f95095279745fc3817ecb0ac1e8b7` |
| `raw/base/assets/bin/Data/sharedassets1.assets` — `.split0`부터 `.split22`까지 숫자순으로 읽은 스트림 | `65abc054aa50c59736482aeb65591d15ce484165f9860d63e8905fda55b9e622` |
| `unity-resources/objects.csv` | `584d4da2ad012d6ccd9660ca587fdec20845f8dfe2eb6746b86f6ba0eb4dd53d` |
| `unity-resources/gameobjects.jsonl` | `2e7cd09de833895299c2fd03094cfa272689bdd646016f776417e341170cf8d3` |
| `unity-resources/TagManager/TagManager__9e1450df__3.json` | `2f0e53259b025c0eb2f97ea6713f9d01e8ef6ac6b6f8c9889ad3acd6ea2d141c` |
| `unity-resources/PhysicsManager/PhysicsManager__9e1450df__10.json` | `f93fdebef28e72c983df314e44c518d5d3aa90c6f224d47f67d2d197a3202ef3` |

### 일반 손님의 다중 주문

단순히 필드 이름을 해석한 것이 아니라 다음 메서드의 필드 읽기·정수 산술·호출을 대조했다. 주소는 위 arm64 라이브러리의 RVA이며, `dump.cs`는 메서드 이름과 필드 오프셋을 대조하는 데 사용했다.

| 직접 확인한 위치 | 확인 내용 |
| --- | --- |
| `Stage.InitData`, RVA `0x182D660–0x182D688`, `0x182D864–0x182D890` | 지역별 `_customerCoffeeOrder`의 `StageItem.minCount = 1`, `maxCount = 2`를 설정한다. `StageItem` 필드는 dump.cs 19865줄부터 확인했다. |
| `Customer` 생성자, RVA `0x1B08120–0x1B08124` | 일반 손님 기본 `_orderCustomerType`은 **4**다. enum의 이름은 `Total`이며, 전화 주문의 `TableCustomer = 1`과 다르다. |
| `CounterCustomer.PlaceOrder`, RVA `0x19E9ACC–0x19E9AD8` | 손님의 `_orderCustomerType`, `_type`, `_zone`을 `Order.PlaceOrder`에 전달한다. |
| `Order.FoodOrderSet`, RVA `0x19AD174–0x19AD1C4` | `_zoneActiveTableCount[zone]`가 `orderCountPerTableCount` 이상이면 정수 나눗셈 뒤 `orderCountPerTable`을 곱한다. 첫 지역의 추가량은 **floor(활성 식탁 수 / 4) × 1**이다. |
| 같은 메서드, RVA `0x19AD1EC–0x19AD210`, `0x19AD26C` | 활성 식탁이 2개 미만이면 후보 수량은 **1**이다. 그 외에는 `minCount + 추가량`부터 `maxCount + 추가량`까지 양끝을 포함하는 정수 난수를 사용한다. |
| `Order.OrderMenu`, RVA `0x19AE518–0x19AE588` | 첫 지역이며 후보 수량이 3 이상이고 **GuideManager._currentGuideIndex ≤ 11**이면 다시 **1~2개**로 제한하는 튜토리얼 보정이 있다. `Singletons._guideManager`의 정적 오프셋 `0x40`과 GuideManager의 인스턴스 오프셋 `0x30`을 대조했다. |
| `OrderBalloonForm.Refresh`, RVA `0x1869014–0x186904C`, `0x1869098–0x18690F0` | 받은 수량과 최초 주문 수량을 텍스트로 갱신하고, 받은 수량이 최초 수량 이상이면 완료 표시를 켠다. 선언은 dump.cs **42133줄**부터다. |

따라서 **일반 손님 주문 후보**는 식탁 1개에서 1개, 2~3개에서 1~2개, 4~7개에서 2~3개로 증가하는 구조를 확인했다. 다만 마지막 수량은 튜토리얼 보정과 품목 분배를 통과한다. `OrderMenus`는 활성 생산 품목과 다중 메뉴 분기를 함께 다루며, VIP·전화·포장 주문에는 추가 분기도 있다. 그러므로 위 후보 범위를 모든 고객·모든 시점의 최종 주문 수량이라고 표시하지 않는다. 웹게임에서 같은 품목의 주문량을 순차 전달하는 작은 규칙으로 적용하는 것은 가능한 재해석이며, 원작의 전체 주문 분배·실험군까지 복원한 것은 아니다.

앞선 다중 주문의 “정확한 산식을 확정하지 못함”은 이 추가 조사로 **일반 주문 후보 범위까지 일부 해소**했다. 첫 지역 scene의 비어 있는 `_customerCoffeeOrder` 배열만으로 주문 수량이 없다고 판단하면 안 된다. 런타임 초기화에서 위 값이 채워진다.

### 손님 통과와 고정 시설의 몸체 구분

TagManager의 레이어는 Player **6**, Area **8**, Customer **13**, Door **14**, Worker **15**다. PhysicsManager의 행렬에서는 **Player↔Customer와 Customer↔Customer 접촉이 꺼져 있고**, Player↔Area와 Player↔Worker는 켜져 있다. 이 행렬만으로 시설이 물리적으로 막힌다고 결론 내리지 않고, 실제 Collider와 NavMeshObstacle을 따로 확인했다.

다음 표의 공통 `source`는 첫 지역 `f60e1eeecaf54344ebfcb50bfcda2221`이다. 크기와 extents는 원문의 로컬 좌표 값이며 웹 픽셀 치수로 직접 환산하지 않는다.

| 대상 | 기본 컴포넌트 `path_id` / objects.csv 줄 | 직접 확인한 값 |
| --- | --- | --- |
| 첫 식탁 GO 125 | BoxCollider **9924 / 130348** | `m_IsTrigger = true`, `m_Size = (3.25, 1, 3.25)` |
| 첫 식탁 GO 125 | NavMeshObstacle **10638 / 131062** | `m_Carve = true`, `m_Extents = (0.3, 0.5, 0.3)`, `m_Center = (0, 0.5, 0)` |
| Counter GO 1324 | BoxCollider **9970 / 130394** | `m_IsTrigger = true`, `m_Size = (4, 1, 3)` |
| Counter GO 1324 | NavMeshObstacle **10602 / 131026** | `m_Carve = true`, `m_Extents = (1.9, 0.5, 0.45)`, `m_Center = (0, 0.5, -0.2)` |
| Coffee1Machine GO 84 | NavMeshObstacle **10590 / 131014** | `m_Carve = true`, `m_Extents = (0.8, 1, 0.8)`, `m_Center = (0, 1, 0.2)` |
| Player GO 2307 | CapsuleCollider **10303 / 130727** | `m_IsTrigger = true`, `m_Radius = 0.25`, `m_Height = 2` |
| Player GO 2307 | NavMeshAgent **10446 / 130870** | `m_Radius = 0.25`, `m_ObstacleAvoidanceType = 0`, 직렬화된 `m_Enabled = 0` |

Counter와 첫 식탁 자신의 Transform 로컬 스케일은 `(1,1,1)`이다. 위 Collider는 상호작용 감지용 Trigger이며, 같은 시설의 NavMeshObstacle에는 별도의 작은 몸체 범위가 있다. 따라서 **넓은 상하차 영역과 좁은 고정 시설 장애물을 분리**하는 것이 확인된 원작 구조에 가깝다. 작은 고정 장애물만 피하고 손님 줄을 통과하는 웹 규칙에 근거로 사용할 수 있다. 실제 NavMesh 결과·부모 Transform 전체·시설 활성화 시점과 런타임 수정까지 재현했다는 의미는 아니다.

일반 손님은 `sharedassets1.assets`의 GO **3082**, CustomerNormal MonoBehaviour **5578 / JSONL 21796줄**, NavMeshAgent **4266 / objects.csv 169886줄**, CapsuleCollider **4241 / objects.csv 169861줄**이다. GO는 Customer 레이어 13이고, CapsuleCollider는 Trigger이며 radius 0.25다. NavMeshAgent도 radius 0.25, avoidance 값 0을 사용한다. Unity에서 회피 비활성의 의미는 [공식 NoObstacleAvoidance 문서](https://docs.unity3d.com/kr/current/ScriptReference/AI.ObstacleAvoidanceType.NoObstacleAvoidance.html)로 확인했다. 직렬화 상태에서 Agent가 꺼져 있으므로 런타임 전체에 걸쳐 이동이 꺼진다는 뜻으로 읽지 않는다.

### 개별 물건·층 쌓기·진행 표시의 확인 범위

첫 지역 Player는 `path_id = 12656`, JSONL **13176줄**에서 `_itemParent`와 6개의 `_foodParent`를 참조하고 `_itemRootDistance = 2`를 사용한다. Item 예시는 `path_id = 12252`, JSONL **12772줄**에서 `itemSizeX/Z = 0.45`, `itemSizeY = 0.35`다. 숫자는 특정 버거 Item의 직렬화 치수이므로 모든 웹 상품을 같은 높이로 바꿔야 한다는 지침은 아니다.

`Item` 선언은 dump.cs **18819줄**부터이며 위치·목표·포물선 진행 필드와 `Parabola`, `ParabolaLocal`, `TickParabola`가 있다. Counter의 보관 코루틴에서 RVA **0x19E719C**, 판매 코루틴에서 **0x191A290**, 식탁 청소 코루틴에서 **0x18403CC**가 실제 `Item.Parabola`를 호출하는 것도 확인했다. 이는 보관 숫자만 순간 변경하는 흐름보다 **개별 물건이 출발점에서 운반자·시설로 날아가는 표현**을 뒷받침한다. 그 호출들의 높이 인자에는 1.5가 있지만, 웹의 화면 단위·상하차 시간을 그대로 결정하는 값으로 사용하지 않는다.

`PlayerMove` 선언은 dump.cs **32833줄**부터이고, `GetItemsMove`, `GetItemsMoveStop`, 최대 굽힘 각도 3과 복원 시간 0.5 등의 상수가 있다. 이는 이동 중 쌓인 물건의 흔들림·복원 표현에 대한 정적 근거다. 원작 영상의 정확한 물건 표시 개수·머리 위 위치·가속도 곡선·상하차 간격은 이 상수만으로 확정하지 않는다.

시간 게이지와 주문 수량 표시는 구분한다. `ObjectGauge` 선언은 dump.cs **42006줄**부터이고 시간·시작 비율·채움 방향·완료 콜백으로 변하는 API가 있다. 그러나 해당 클래스는 손님 전화·졸음 문제, 광고, 진열 리필 등 여러 용도에서 참조된다. 이 클래스가 존재한다는 이유만으로 **모든 운반·결제·청소에 동일한 원형 게이지가 사용된다**고 단정하지 않는다. 직접 확인한 일반 주문의 수량 완료 표시는 위 `OrderBalloonForm`이며, 새 웹 작업 게이지의 표시 조건과 시간은 별도 설계·영상 관찰로 검증해야 한다. APK 실행에 따른 새 시간 계측은 이번에도 수행하지 않았다.

## 추가 정적 검토: 바닥 영역과 이동 적재 — 2026-10-31

위와 같은 해시의 scene·JSONL·`dump.cs`를 다시 읽었다. 기본 컴포넌트는 UnityPy로 해당 scene 객체만 직접 읽었으며 APK 설치·실행이나 네이티브 코드 실행은 하지 않았다. 아래의 선언·직렬화 값과 실제 런타임 동작의 확인 범위는 구분한다.

### 바닥 장식·시설 몸체·작업 판정의 별도 객체

첫 지역 source `f60e1eeecaf54344ebfcb50bfcda2221`에서 다음 참조를 확인했다.

| 대상 | 식별자 | 이번에 직접 확인한 구조 |
| --- | --- | --- |
| 시설 UpgradeArea 예시 1 | MonoBehaviour **11933**, JSONL **12453줄**, GO **1199** | 시설 노드 **12916**, 바닥 외곽 `_outlineTransform` **6215**, `upgradeAreaObject` **3505**, `slide` **7588**, `priceText` **12929**를 각각 참조한다. |
| 시설 UpgradeArea 예시 2 | MonoBehaviour **12012**, JSONL **12532줄**, GO **1054** | 시설 노드 **12938**, 외곽 **6203**, 강화 장식 **3463**, 진행 슬라이드 **7737**, 비용 텍스트 **12925**를 참조한다. |
| 위 UpgradeArea의 판정 몸체 | BoxCollider **10066 / 10077** | 각각 `m_IsTrigger=true`, 로컬 크기 약 **(1.8,1,1.8)**, 중심 **(0,0.5,0)**다. 자신의 Transform **5267 / 5147**은 로컬 위치 **(-2,0.1,0)**, 스케일 **(1,1,1)**이다. 부모 Transform이 있으므로 이 로컬 좌표를 매장 절대 좌표로 읽지 않는다. |
| 대금 영역 예시 1·2 | MoneyArea **11956 / 11996**, JSONL **12476 / 12516줄**, GO **2258 / 2149** | 각각 자체 Transform **6292 / 6174**와 별도 돈 수량을 가진다. BoxCollider **9866 / 9872**는 `m_IsTrigger=true`, 크기 **(2.5,1,2.5)**, 중심 **(0,0.5,0)**이다. 이 예시는 `BoostArea_MoneyArea` 이름이며 모든 카운터·식탁의 크기가 같다고 일반화하지 않는다. |
| 주인공 강화 시설 | PlayerUpgradeArea **12650**, JSONL **13170줄**, GO **2239** | 강화 시설 Transform **6692**를 참조한다. `dump.cs` **32918줄**부터 `OnTriggerEnter`·`OnTriggerExit`·`OpenUI`·`CloseUI`가 선언된다. GO의 큰 BoxCollider **9971**은 **비 Trigger**이므로 그 전체 크기를 바닥 원의 진입 영역이라고 오해하지 않는다. |
| 조수 강화 시설 | HRUpgradeArea **11952**, JSONL **12472줄**, GO **3268** | 강화 시설 Transform **7780**, 직원 출현 Transform **7026**을 별도로 참조한다. `dump.cs` **18202줄**부터 해당 클래스의 진입·이탈 및 UI 메서드를 대조할 수 있다. |

`Area` 선언은 `dump.cs` **7265줄**부터다. `areaObject`, `_outlineTransform`, `_initOutlineScale`과 `UpdateAreaGauge`·`PlayAreaCompletion`이 있다. `UpgradeArea`는 **46096줄**부터 시설 `_node`와 `enterPlayer`, 비용·슬라이드·광고 게이지를 분리한다. 시설의 시각 모델 중심, 바닥 장식, Trigger, 고정 장애물의 좌표가 모두 같은 하나의 값일 필요는 없으며, 각각의 관계를 맞추어야 한다는 근거다. 원본 장식이 원형이라고 해서 BoxCollider도 원형이라고 기록하지 않는다.

`MoneyArea` 선언은 **29337줄**부터이며 `PICKUP_MONEY_DISTANCE = 1.25`, `SetPickupDistance(float)`, 자체 BoxCollider 필드, `OnTriggerEnter`·`OnTriggerExit`·`PickUpMoneyUpdate`·`PickUpMoney(Player)`를 확인했다. `SetPickupDistance`가 있으므로 1.25를 모든 시설·강화 상태의 고정 런타임 수거 거리라고 단정하지 않는다. 이 선언만으로 정지 대기 시간·한 번의 수거량·원 밖에서 수거되는 모든 예외를 확정하지도 않는다. 웹의 바닥 원 반경과 “원 안에 서야 수행” 조건은 사용자 요구에 따른 별도 구현값이다.

### 이동 중 적재와 정지 후 복원

`PlayerMove`의 **32833줄**부터 다음 상수를 다시 직접 확인했다.

| 필드 | 값 |
| --- | ---: |
| `BEND_MAGNITUDE_RETRIGGER_THRESHOLD` | **0.1** |
| `BEND_MAX_ANGLE` | **3** |
| `BEND_RESTORE_DURATION` | **0.5** |
| `BEND_RESTORE_ELASTIC_AMPLITUDE` | **1.1** |
| `BEND_RESTORE_ELASTIC_PERIOD` | **0.4** |

같은 클래스의 `GetItemsMove(float magnitude)` RVA **0x17EF524**와 `GetItemsMoveStop()` RVA **0x17EF4B8**를 이름·선언 위치로 대조했다. 이는 이동량에 따른 적재 흔들림과 정지 후 탄성 복원의 존재를 뒷받침한다. 이전에 확인한 `Item.Parabola`와 함께 개별 전달→도착→층 적재의 표현을 참고한다. 이번 검토에서는 해당 함수의 전체 보간 곡선을 디컴파일하거나 영상을 실행 계측하지 않았으므로, 웹의 통통 튀는 높이·복원 곡선·층별 반응 시간까지 원작과 완전히 같다고 표현하지 않는다.

현재 공식 스토어의 정지 이미지에서 보인 시설·바닥 표시와 빈 통로는 [RESEARCH.md](../RESEARCH.md)의 2026-10-31 표에 따로 기록했다. 이번 브라우저 접근 제한으로 새 영상을 재생하지 못했으며, 앞선 2026-10-30의 영상 관찰을 이번 관찰로 재사용하지 않는다.
