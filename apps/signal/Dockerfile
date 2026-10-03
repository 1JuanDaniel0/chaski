# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q -DskipTests package

FROM eclipse-temurin:24-jre
RUN groupadd --gid 10001 chasqui && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin chasqui
WORKDIR /app
COPY --from=build /build/target/chasqui-signal.jar /app/app.jar
USER 10001:10001
EXPOSE 8443
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -Xss512k -XX:+ExitOnOutOfMemoryError"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
