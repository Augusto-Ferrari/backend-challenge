import json
import boto3

sqs = boto3.client(
    "sqs",
    endpoint_url="http://localhost:4566",
    region_name="us-east-1",
    aws_access_key_id="test",
    aws_secret_access_key="test",
)

# Fila de mensagens que esgotaram as tentativas
dlq = sqs.create_queue(
    QueueName="wager-transactions-dlq.fifo",
    Attributes={"FifoQueue": "true"},
)

dlq_url = dlq["QueueUrl"]

dlq_arn = sqs.get_queue_attributes(
    QueueUrl=dlq_url,
    AttributeNames=["QueueArn"],
)["Attributes"]["QueueArn"]

# Fila principal com política de redrive
sqs.create_queue(
    QueueName="wager-transactions.fifo",
    Attributes={
        "FifoQueue": "true",
        "RedrivePolicy": json.dumps({
            "deadLetterTargetArn": dlq_arn,
            "maxReceiveCount": "5",
        }),
    },
)

# Fila de eventos publicados pela Outbox
sqs.create_queue(
    QueueName="wager-events.fifo",
    Attributes={"FifoQueue": "true"},
)

print("Filas SQS criadas com sucesso!")
