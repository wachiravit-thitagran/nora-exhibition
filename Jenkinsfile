/* AI NORA — สไลด์นิทรรศการ
 *
 * ทุก stage รันบน agent เดียว (ainora-agent) และใช้ workspace เดียวตลอดบิลด์
 * จงใจไม่ใช้ `agent { docker { ... } }` และไม่ใช้ parallel เพราะสองอย่างนี้
 * ทำให้ Jenkins ต้องเปิด workspace เพิ่ม (…@2@tmp) และให้ปลั๊กอิน durable-task
 * ไปวางสคริปต์ในไดเรกทอรีที่คอนเทนเนอร์มองไม่เห็น จนขึ้น
 *     process apparently never started in …@tmp/durable-xxxxxxxx
 * เครื่องมือที่ต้องใช้คอนเทนเนอร์ (hadolint / playwright) จึงเรียกด้วย
 * `docker run` ตรง ๆ จาก sh step แทน — ผลเหมือนกันแต่ไม่มีชั้นที่พังง่าย
 */
pipeline {
    agent { label 'ainora-agent' }

    environment {
        REGISTRY_NORAEXHIBITION_IMAGE = "${REGISTRY_URL}/diis-itoc/nora-exhibition"
        REGISTRY_USER = "ci-bot"
        // ไม่ตรึงเลขไว้ — ทุกบิลด์ได้แท็กของตัวเอง จะย้อนกลับเวอร์ชันก่อนหน้าได้
        VERSION = "1.0.${BUILD_NUMBER}"
        EXHIBITION_PORT = "10096"
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 30, unit: 'MINUTES')
    }

    stages {
        stage('Prepare') {
            steps {
                script {
                    env.GIT_SHA = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                }
                sh 'echo "branch=${BRANCH_NAME} commit=${GIT_SHA} version=${VERSION}"'
                sh 'docker version --format "docker {{.Server.Version}}" || (echo "ไม่มี docker บน agent นี้" >&2; exit 1)'
            }
        }

        stage('Lint Dockerfile') {
            when { branch 'develop' }
            steps {
                // เขียนรายงานก่อน แล้วค่อยตัดสินผลจาก exit code
                // ถ้าปล่อยให้ hadolint ล้มทันที บล็อก post จะไม่มีไฟล์รายงานให้เก็บ
                script {
                    def st = sh(returnStatus: true, script: '''
                        docker run --rm -v "$PWD:/w" -w /w \
                            hadolint/hadolint:latest-debian \
                            hadolint --failure-threshold error Dockerfile > hadolint_report.txt 2>&1
                    ''')
                    sh 'cat hadolint_report.txt || true'
                    if (st != 0) { error "Dockerfile lint ไม่ผ่าน (exit ${st})" }
                }
            }
            post {
                always { archiveArtifacts artifacts: 'hadolint_report.txt', allowEmptyArchive: true }
            }
        }

        stage('Verify deck') {
            steps {
                // เปิดสไลด์จริงด้วย Playwright ตรวจ 4 โหมดการแสดงผล
                // เบราว์เซอร์อยู่ในอิมเมจแล้ว จึงข้ามการดาวน์โหลด
                // รันด้วย uid ของ jenkins ไม่ใช่ root ไฟล์ที่เกิดใน workspace จะได้ลบได้
                sh '''
                    docker run --rm \
                        -v "$PWD:/w" -w /w \
                        -u "$(id -u):$(id -g)" \
                        -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
                        -e PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
                        -e EXPECT_SLIDES=62 \
                        mcr.microsoft.com/playwright:v1.59.1-jammy \
                        sh -c 'npm install --no-save --no-audit --no-fund playwright@1.59.1 >/dev/null 2>&1 \
                               && node tests/check-deck.mjs /w' | tee deck_report.txt
                '''
            }
            post {
                always { archiveArtifacts artifacts: 'deck_report.txt', allowEmptyArchive: true }
                cleanup { sh 'rm -rf node_modules package-lock.json || true' }
            }
        }

        stage('Build docker image') {
            steps {
                // เติมวิดีโอ 22 คลิป + ภาพพื้นหลังลง assets/ ก่อน
                // ปกติไฟล์อยู่ใน repo แล้ว ขั้นนี้จึงเป็นด่านตรวจว่าสื่อครบ
                // ถ้าขาด สคริปต์จบด้วย exit 1 ให้บิลด์ล้มตรงนี้ ดีกว่าได้อิมเมจ
                // ที่วิดีโอหายไปเงียบ ๆ แล้วไปรู้ตอนขึ้นจอหน้างาน
                sh 'sh deploy/fetch-media.sh'
                sh '''
                    docker build \
                        -t "$REGISTRY_NORAEXHIBITION_IMAGE:$VERSION" \
                        -t "$REGISTRY_NORAEXHIBITION_IMAGE:$GIT_SHA" \
                        -t "$REGISTRY_NORAEXHIBITION_IMAGE:latest" .
                '''
                sh 'docker image ls "$REGISTRY_NORAEXHIBITION_IMAGE" --format "{{.Tag}}\t{{.Size}}"'
            }
        }

        stage('Upload docker image to registry') {
            // เฉพาะ main — ถ้าให้ develop push ด้วย แท็ก latest จะถูกทับ
            // แล้ว production ที่ดึง latest จะได้ของจาก develop ไปโดยไม่ตั้งใจ
            when { branch 'main' }
            steps {
                withCredentials([string(credentialsId: 'CI_REGISTRY_TOKEN', variable: 'REGISTRY_TOKEN')]) {
                    sh 'echo "$REGISTRY_TOKEN" | docker login -u "$REGISTRY_USER" --password-stdin "$REGISTRY_URL"'
                    sh '''
                        docker push "$REGISTRY_NORAEXHIBITION_IMAGE:$VERSION"
                        docker push "$REGISTRY_NORAEXHIBITION_IMAGE:$GIT_SHA"
                        docker push "$REGISTRY_NORAEXHIBITION_IMAGE:latest"
                    '''
                }
            }
            post {
                always { sh 'docker logout "$REGISTRY_URL" || true' }
            }
        }

        stage('Deploy to Production') {
            when { branch 'main' }
            steps {
                sh '''
                    REGISTRY_NORAEXHIBITION_IMAGE="$REGISTRY_NORAEXHIBITION_IMAGE" \
                    docker compose -f docker-compose.yml up -d --remove-orphans
                '''
                sh 'docker image prune -f'
                // จอนิทรรศการเปิดค้างทั้งวัน ตรวจให้แน่ว่าหน้ายังเสิร์ฟได้จริงก่อนจบบิลด์
                //
                // ตรวจจากในคอนเทนเนอร์ด้วย docker exec ไม่ใช่ curl ไปที่ 127.0.0.1:10096
                // เพราะถ้า agent รันอยู่ในคอนเทนเนอร์ พอร์ตที่ publish จะอยู่ที่ host
                // ไม่ใช่ใน agent — curl จึงไม่มีทางเจอ แม้บริการจะขึ้นเรียบร้อย
                sh '''
                    NAME=nora-exhibition-web
                    st=ไม่พบ
                    for i in $(seq 1 20); do
                        st=$(docker inspect -f '{{.State.Status}}' "$NAME" 2>/dev/null || echo missing)
                        if [ "$st" = "running" ] \
                           && docker exec "$NAME" wget -qO- http://127.0.0.1/exhibition/healthz >/dev/null 2>&1; then
                            echo "คอนเทนเนอร์ทำงานแล้ว"
                            if docker exec "$NAME" wget -qO- http://127.0.0.1/exhibition/ >/dev/null 2>&1; then
                                echo "หน้าสไลด์เสิร์ฟได้"
                            else
                                echo "healthz ผ่าน แต่หน้าสไลด์ไม่ขึ้น" >&2
                                exit 1
                            fi
                            if curl -fsS --max-time 5 "http://127.0.0.1:$EXHIBITION_PORT/exhibition/" -o /dev/null 2>/dev/null; then
                                echo "เข้าจาก 127.0.0.1:$EXHIBITION_PORT ได้"
                            else
                                echo "หมายเหตุ: จาก agent เข้าพอร์ต $EXHIBITION_PORT ไม่ได้"
                                echo "         (ปกติถ้า agent รันในคอนเทนเนอร์) ให้ตรวจจากเครื่อง host แทน"
                            fi
                            exit 0
                        fi
                        sleep 3
                    done
                    echo "คอนเทนเนอร์ไม่ตอบใน 60 วินาที (สถานะล่าสุด: $st)" >&2
                    docker ps -a --filter name="$NAME" --format "{{.Names}}  {{.Status}}" >&2
                    docker logs --tail 100 "$NAME" >&2 || true
                    exit 1
                '''
            }
            post {
                success {
                    echo "ขึ้น production แล้ว — ${REGISTRY_NORAEXHIBITION_IMAGE}:${VERSION} (${GIT_SHA})"
                    sh 'docker ps --format "table {{.Names}}\t{{.Status}}" | grep nora-exhibition || true'
                }
                failure {
                    sh 'docker logs --tail 200 nora-exhibition-web || true'
                }
            }
        }
    }
}
